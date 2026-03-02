import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Shopify Product Sync — imports Shopify products into the peptides table.
 *
 * POST body: { dryRun?: boolean }
 *
 * Fetches products from the connected Shopify store via Composio API
 * and upserts them into the peptides table (matching by SKU first, then by exact name).
 */

Deno.serve(withErrorReporting("shopify-sync-products", async (req) => {
    const preflight = handleCors(req);
    if (preflight) return preflight;
    const corsHeaders = getCorsHeaders(req);

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');
        if (!composioApiKey) throw new Error('Missing COMPOSIO_API_KEY');

        // Authenticate caller
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Unauthorized: no auth header');

        const supabase = createClient(sbUrl, sbServiceKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized: invalid token');

        // Get caller's org_id from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id, role')
            .eq('user_id', user.id)
            .single();

        if (!profile?.org_id) throw new Error('No organization found for user');
        if (!['admin', 'super_admin'].includes(profile.role)) throw new Error('Forbidden: admin role required');
        const orgId = profile.org_id;

        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun === true;

        // Get Shopify connection via Composio
        const { data: connection } = await supabase
            .from('tenant_connections')
            .select('composio_connection_id, status')
            .eq('org_id', orgId)
            .eq('service', 'shopify')
            .single();

        if (!connection || connection.status !== 'connected' || !connection.composio_connection_id) {
            throw new Error('Shopify not connected — please connect via Integrations page');
        }

        // Fetch products from Shopify via Composio
        console.log(`[shopify-sync-products] Fetching products for org ${orgId}`);

        const composioRes = await fetch('https://backend.composio.dev/api/v2/actions/SHOPIFY_GET_PRODUCTS/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': composioApiKey,
            },
            body: JSON.stringify({
                connectedAccountId: connection.composio_connection_id,
                input: {},
            }),
        });

        if (!composioRes.ok) {
            const errText = await composioRes.text();
            throw new Error(`Composio API error: ${composioRes.status} — ${errText.slice(0, 200)}`);
        }

        const composioData = await composioRes.json();
        const allProducts: any[] = extractProducts(composioData);

        console.log(`[shopify-sync-products] Fetched ${allProducts.length} products from Shopify`);

        if (allProducts.length === 0) {
            return jsonResponse({
                success: true,
                shopify_product_count: 0,
                created: 0,
                updated: 0,
                skipped: 0,
                errors: 0,
                dry_run: dryRun,
            }, 200, corsHeaders);
        }

        // Get existing peptides for this org
        const { data: existingPeptides } = await supabase
            .from('peptides')
            .select('id, name, sku, retail_price, description')
            .eq('org_id', orgId);

        const existing = existingPeptides || [];
        const byName = new Map(existing.map(p => [p.name.toLowerCase(), p]));
        const bySku = new Map(existing.filter(p => p.sku).map(p => [p.sku!.toLowerCase(), p]));

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const product of allProducts) {
            try {
                const name = product.title?.trim();
                if (!name) { skipped++; continue; }

                // Shopify products can have multiple variants — process each
                const variants = product.variants || [product];

                for (const variant of variants) {
                    const variantName = variants.length > 1 && variant.title && variant.title !== 'Default Title'
                        ? `${name} - ${variant.title}`
                        : name;
                    const sku = variant.sku?.trim() || null;
                    const price = parseFloat(variant.price) || 0;
                    const description = stripHtml(product.body_html || '').slice(0, 500);

                    // Match: SKU first, then exact name
                    let match = sku ? bySku.get(sku.toLowerCase()) : undefined;
                    if (!match) match = byName.get(variantName.toLowerCase());

                    if (match) {
                        const needsUpdate =
                            (price > 0 && match.retail_price !== price) ||
                            (description && match.description !== description);

                        if (needsUpdate && !dryRun) {
                            const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
                            if (price > 0) updateFields.retail_price = price;
                            if (description) updateFields.description = description;
                            if (sku && !match.sku) updateFields.sku = sku;

                            const { error } = await supabase
                                .from('peptides')
                                .update(updateFields)
                                .eq('id', match.id);

                            if (error) { console.error(`[shopify-sync] Update ${variantName}: ${error.message}`); errors++; }
                            else updated++;
                        } else {
                            skipped++;
                        }
                    } else {
                        if (!dryRun) {
                            const { error } = await supabase
                                .from('peptides')
                                .insert({
                                    org_id: orgId,
                                    name: variantName,
                                    sku: sku || undefined,
                                    description: description || undefined,
                                    retail_price: price > 0 ? price : undefined,
                                    active: product.status === 'active',
                                });

                            if (error) { console.error(`[shopify-sync] Insert ${variantName}: ${error.message}`); errors++; }
                            else {
                                created++;
                                byName.set(variantName.toLowerCase(), { id: 'new', name: variantName, sku, retail_price: price, description });
                                if (sku) bySku.set(sku.toLowerCase(), { id: 'new', name: variantName, sku, retail_price: price, description });
                            }
                        } else {
                            created++;
                        }
                    }
                }
            } catch (itemErr: any) {
                console.error(`[shopify-sync] Product error: ${itemErr.message}`);
                errors++;
            }
        }

        console.log(`[shopify-sync-products] Done: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors (dryRun=${dryRun})`);

        return jsonResponse({
            success: true,
            shopify_product_count: allProducts.length,
            created,
            updated,
            skipped,
            errors,
            dry_run: dryRun,
        }, 200, corsHeaders);

    } catch (error: any) {
        console.error('[shopify-sync-products] Error:', error.message);
        return jsonResponse(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            corsHeaders,
        );
    }
}));

/** Extract products array from Composio response (handles different response shapes) */
function extractProducts(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (data?.data?.products) return data.data.products;
    if (data?.response_data?.products) return data.response_data.products;
    if (data?.products) return data.products;
    if (data?.data && Array.isArray(data.data)) return data.data;
    if (data?.response_data && Array.isArray(data.response_data)) return data.response_data;
    return [];
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
}
