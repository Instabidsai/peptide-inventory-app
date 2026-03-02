import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Shopify Customer Sync — imports Shopify customers into the contacts table.
 *
 * POST body: { dryRun?: boolean }
 *
 * Fetches customers from the connected Shopify store via Composio API
 * and upserts them into the contacts table (matching by email, case-insensitive).
 */

Deno.serve(withErrorReporting("shopify-sync-customers", async (req) => {
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

        // Fetch customers from Shopify via Composio
        console.log(`[shopify-sync-customers] Fetching customers for org ${orgId}`);

        const composioRes = await fetch('https://backend.composio.dev/api/v2/actions/SHOPIFY_GET_ALL_CUSTOMERS/execute', {
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
        const allCustomers: any[] = extractCustomers(composioData);

        console.log(`[shopify-sync-customers] Fetched ${allCustomers.length} customers from Shopify`);

        if (allCustomers.length === 0) {
            return jsonResponse({
                success: true,
                total: 0,
                imported: 0,
                updated: 0,
                skipped: 0,
                errors: 0,
                dry_run: dryRun,
            }, 200, corsHeaders);
        }

        // Get existing contacts for this org (for email matching)
        const { data: existingContacts } = await supabase
            .from('contacts')
            .select('id, email, name, phone, address')
            .eq('org_id', orgId);

        const existing = existingContacts || [];
        const byEmail = new Map(
            existing.filter(c => c.email).map(c => [c.email!.toLowerCase(), c])
        );

        let imported = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const customer of allCustomers) {
            try {
                const email = (customer.email || '').trim().toLowerCase();
                if (!email) { skipped++; continue; }

                const firstName = (customer.first_name || '').trim();
                const lastName = (customer.last_name || '').trim();
                const name = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];
                const phone = customer.phone?.trim() || null;
                const address = formatShopifyAddress(customer.default_address);

                const match = byEmail.get(email);

                if (match) {
                    // Update if we have richer data
                    const needsUpdate =
                        (!match.phone && phone) ||
                        (!match.address && address) ||
                        (match.name === email.split('@')[0] && name !== email.split('@')[0]);

                    if (needsUpdate && !dryRun) {
                        const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
                        if (!match.phone && phone) updateFields.phone = phone;
                        if (!match.address && address) updateFields.address = address;
                        if (match.name === email.split('@')[0] && name !== email.split('@')[0]) {
                            updateFields.name = name;
                        }

                        const { error } = await supabase
                            .from('contacts')
                            .update(updateFields)
                            .eq('id', match.id);

                        if (error) { console.error(`[shopify-sync-customers] Update ${email}: ${error.message}`); errors++; }
                        else updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    // Create new contact
                    if (!dryRun) {
                        const { error } = await supabase
                            .from('contacts')
                            .insert({
                                org_id: orgId,
                                name,
                                email,
                                phone,
                                address: address || null,
                                source: 'shopify',
                            });

                        if (error) { console.error(`[shopify-sync-customers] Insert ${email}: ${error.message}`); errors++; }
                        else {
                            imported++;
                            byEmail.set(email, { id: 'new', email, name, phone, address });
                        }
                    } else {
                        imported++;
                    }
                }
            } catch (itemErr: any) {
                console.error(`[shopify-sync-customers] Customer error: ${itemErr.message}`);
                errors++;
            }
        }

        console.log(`[shopify-sync-customers] Done: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors} errors (dryRun=${dryRun})`);

        return jsonResponse({
            success: true,
            total: allCustomers.length,
            imported,
            updated,
            skipped,
            errors,
            dry_run: dryRun,
        }, 200, corsHeaders);

    } catch (error: any) {
        console.error('[shopify-sync-customers] Error:', error.message);
        return jsonResponse(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            corsHeaders,
        );
    }
}));

/** Extract customers array from Composio response (handles different response shapes) */
function extractCustomers(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (data?.data?.customers) return data.data.customers;
    if (data?.response_data?.customers) return data.response_data.customers;
    if (data?.customers) return data.customers;
    if (data?.data && Array.isArray(data.data)) return data.data;
    if (data?.response_data && Array.isArray(data.response_data)) return data.response_data;
    return [];
}

/** Format a Shopify address to a single string */
function formatShopifyAddress(addr: any): string {
    if (!addr) return '';
    const parts = [
        addr.address1,
        addr.address2,
        addr.city,
        addr.province_code || addr.province,
        addr.zip,
        addr.country_code || addr.country,
    ].filter(Boolean);
    return parts.join(', ');
}
