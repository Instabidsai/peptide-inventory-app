import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * WooCommerce Customer Sync — imports WooCommerce customers into the contacts table.
 *
 * POST body: { dryRun?: boolean }
 *
 * Paginates through WooCommerce's customer API and upserts into contacts
 * (matching by email, case-insensitive).
 */

Deno.serve(withErrorReporting("woo-sync-customers", async (req) => {
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
            .select('org_id, role')
            .eq('user_id', user.id)
            .single();

        if (!profile?.org_id) throw new Error('No organization found for user');
        if (!['admin', 'super_admin'].includes(profile.role)) throw new Error('Forbidden: admin role required');
        const orgId = profile.org_id;

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

        // Fetch customers from WooCommerce (paginated, up to 500)
        const basicAuth = btoa(`${consumerKey}:${consumerSecret}`);
        const allCustomers: any[] = [];
        let page = 1;
        const maxPages = 5; // 5 pages × 100 = 500 customers max

        while (page <= maxPages) {
            const wcRes = await fetch(
                `${storeUrl}/wp-json/wc/v3/customers?per_page=100&page=${page}`,
                { headers: { 'Authorization': `Basic ${basicAuth}` } }
            );

            if (!wcRes.ok) {
                const errText = await wcRes.text();
                throw new Error(`WooCommerce API error: ${wcRes.status} — ${errText.slice(0, 200)}`);
            }

            const customers = await wcRes.json();
            if (!Array.isArray(customers) || customers.length === 0) break;

            allCustomers.push(...customers);
            if (customers.length < 100) break; // last page
            page++;
        }

        console.log(`[woo-sync-customers] Fetched ${allCustomers.length} customers from ${storeUrl}`);

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
                const phone = customer.billing?.phone?.trim() || null;
                const address = formatWooAddress(customer.billing || customer.shipping);

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

                        if (error) { console.error(`[woo-sync-customers] Update ${email}: ${error.message}`); errors++; }
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
                                source: 'woocommerce',
                            });

                        if (error) { console.error(`[woo-sync-customers] Insert ${email}: ${error.message}`); errors++; }
                        else {
                            imported++;
                            byEmail.set(email, { id: 'new', email, name, phone, address });
                        }
                    } else {
                        imported++;
                    }
                }
            } catch (itemErr: any) {
                console.error(`[woo-sync-customers] Customer error: ${itemErr.message}`);
                errors++;
            }
        }

        console.log(`[woo-sync-customers] Done: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors} errors (dryRun=${dryRun})`);

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
        console.error('[woo-sync-customers] Error:', error.message);
        return jsonResponse(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            corsHeaders,
        );
    }
}));

/** Format a WooCommerce address to a single string */
function formatWooAddress(addr: any): string {
    if (!addr) return '';
    const parts = [
        addr.address_1,
        addr.address_2,
        addr.city,
        addr.state,
        addr.postcode,
        addr.country,
    ].filter(Boolean);
    return parts.join(', ');
}
