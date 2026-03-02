import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * WooCommerce Product Sync — imports WooCommerce products into the peptides table.
 *
 * POST body: { org_id, dryRun?: boolean }
 *
 * Fetches products from the connected WooCommerce store and upserts them
 * into the peptides table (matching by SKU first, then by exact name).
 */

Deno.serve(withErrorReporting("woo-sync-products", async (req) => {
    const preflight = handleCors(req);
    if (preflight) return preflight;
    const corsHeaders = getCorsHeaders(req);

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

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
            .select('org_id')
            .eq('user_id', user.id)
            .single();

        if (!profile?.org_id) throw new Error('No organization found for user');
        const orgId = profile.org_id;

        // Verify caller is admin
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('org_id', orgId)
            .single();

        if (!callerRole || !['admin', 'super_admin'].includes(callerRole.role)) {
            throw new Error('Forbidden: admin role required');
        }

        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun === true;

        // Get WooCommerce credentials
        const { data: apiKeys } = await supabase
            .from('tenant_api_keys')
            .select('service, api_key')
            .eq('org_id', orgId)
            .in('service', ['woo_consumer_key', 'woo_consumer_secret', 'woo_url']);

        if (!apiKeys || apiKeys.length < 3) {
            throw new Error('WooCommerce not connected — missing API keys');
        }

        const keyMap: Record<string, string> = {};
        for (const k of apiKeys) keyMap[k.service] = k.api_key;

        const storeUrl = keyMap['woo_url'];
        const consumerKey = keyMap['woo_consumer_key'];
        const consumerSecret = keyMap['woo_consumer_secret'];

        if (!storeUrl || !consumerKey || !consumerSecret) {
            throw new Error('WooCommerce credentials incomplete');
        }

        // Fetch products from WooCommerce (paginated, up to 300)
        const basicAuth = btoa(`${consumerKey}:${consumerSecret}`);
        const allProducts: any[] = [];
        let page = 1;
        const maxPages = 3; // 3 pages × 100 = 300 products max

        while (page <= maxPages) {
            const wcRes = await fetch(
                `${storeUrl}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`,
                { headers: { 'Authorization': `Basic ${basicAuth}` } }
            );

            if (!wcRes.ok) {
                const errText = await wcRes.text();
                throw new Error(`WooCommerce API error: ${wcRes.status} — ${errText.slice(0, 200)}`);
            }

            const products = await wcRes.json();
            if (!Array.isArray(products) || products.length === 0) break;

            allProducts.push(...products);
            if (products.length < 100) break; // last page
            page++;
        }

        console.log(`[woo-sync-products] Fetched ${allProducts.length} products from ${storeUrl}`);

        if (allProducts.length === 0) {
            return jsonResponse({
                success: true,
                woo_product_count: 0,
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

        for (const wooProduct of allProducts) {
            try {
                const name = wooProduct.name?.trim();
                const sku = wooProduct.sku?.trim() || null;
                const price = parseFloat(wooProduct.price) || parseFloat(wooProduct.regular_price) || 0;
                const description = wooProduct.short_description
                    ? stripHtml(wooProduct.short_description).slice(0, 500)
                    : stripHtml(wooProduct.description || '').slice(0, 500);

                if (!name) { skipped++; continue; }

                // Match: SKU first, then exact name
                let match = sku ? bySku.get(sku.toLowerCase()) : undefined;
                if (!match) match = byName.get(name.toLowerCase());

                if (match) {
                    // Update if price or description changed
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

                        if (error) { console.error(`[woo-sync] Update ${name}: ${error.message}`); errors++; }
                        else updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    // Create new peptide
                    if (!dryRun) {
                        const { error } = await supabase
                            .from('peptides')
                            .insert({
                                org_id: orgId,
                                name,
                                sku: sku || undefined,
                                description: description || undefined,
                                retail_price: price > 0 ? price : undefined,
                                active: true,
                            });

                        if (error) { console.error(`[woo-sync] Insert ${name}: ${error.message}`); errors++; }
                        else {
                            created++;
                            // Add to lookup maps so duplicates within the same WC batch are caught
                            byName.set(name.toLowerCase(), { id: 'new', name, sku, retail_price: price, description });
                            if (sku) bySku.set(sku.toLowerCase(), { id: 'new', name, sku, retail_price: price, description });
                        }
                    } else {
                        created++;
                    }
                }
            } catch (itemErr: any) {
                console.error(`[woo-sync] Product error: ${itemErr.message}`);
                errors++;
            }
        }

        console.log(`[woo-sync-products] Done: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors (dryRun=${dryRun})`);

        return jsonResponse({
            success: true,
            woo_product_count: allProducts.length,
            created,
            updated,
            skipped,
            errors,
            dry_run: dryRun,
        }, 200, corsHeaders);

    } catch (error: any) {
        console.error('[woo-sync-products] Error:', error.message);
        return jsonResponse(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            corsHeaders,
        );
    }
}));

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
}
