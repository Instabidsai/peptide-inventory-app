import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Sync Discount Codes — pushes partner discount codes to WooCommerce and/or Shopify.
 *
 * POST body: {
 *   code_id?: string,        // Sync a specific code (by ID)
 *   action: "create" | "update" | "delete",
 *   code: string,            // e.g. "JOHN20"
 *   discount_percent: number, // e.g. 20
 *   partner_id: string,
 *   platform?: "woocommerce" | "shopify" | "both"
 * }
 *
 * Creates/updates/deletes the discount code in the partner_discount_codes table
 * and syncs it to the connected WooCommerce/Shopify store(s).
 */

Deno.serve(withErrorReporting("sync-discount-codes", async (req) => {
    const preflight = handleCors(req);
    if (preflight) return preflight;
    const corsHeaders = getCorsHeaders(req);

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');
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

        const body = await req.json();
        const { action, code, discount_percent, partner_id, platform } = body;

        if (!action || !['create', 'update', 'delete'].includes(action)) {
            throw new Error('Invalid action — must be create, update, or delete');
        }

        const results: Record<string, any> = { action, code };

        // ── Handle DELETE ───────────────────────────────────────
        if (action === 'delete') {
            if (!body.code_id && !code) throw new Error('code_id or code required for delete');

            const query = body.code_id
                ? supabase.from('partner_discount_codes').select('*').eq('id', body.code_id).eq('org_id', orgId).single()
                : supabase.from('partner_discount_codes').select('*').eq('org_id', orgId).ilike('code', code).single();

            const { data: existing } = await query;
            if (!existing) throw new Error('Discount code not found');

            // Delete from platforms if synced
            if (existing.platform_coupon_id) {
                await deletePlatformCoupon(supabase, orgId, existing, composioApiKey);
            }

            // Deactivate (soft delete)
            await supabase
                .from('partner_discount_codes')
                .update({ active: false, updated_at: new Date().toISOString() })
                .eq('id', existing.id);

            results.deleted = true;
            return jsonResponse({ success: true, ...results }, 200, corsHeaders);
        }

        // ── Handle CREATE / UPDATE ──────────────────────────────
        if (!code || typeof discount_percent !== 'number') {
            throw new Error('code and discount_percent are required');
        }

        if (action === 'create') {
            if (!partner_id) throw new Error('partner_id is required for create');

            // Verify partner exists in this org
            const { data: partnerProfile } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('user_id', partner_id)
                .eq('org_id', orgId)
                .single();

            if (!partnerProfile) throw new Error('Partner not found in this organization');

            // Insert into DB
            const { data: newCode, error: insertErr } = await supabase
                .from('partner_discount_codes')
                .insert({
                    org_id: orgId,
                    partner_id,
                    code: code.toUpperCase(),
                    discount_percent,
                    platform: platform || null,
                    active: true,
                })
                .select()
                .single();

            if (insertErr) throw new Error(`Failed to create code: ${insertErr.message}`);

            // Sync to platforms
            const syncResults = await syncToPlatforms(supabase, orgId, newCode, composioApiKey);
            results.created = true;
            results.platform_sync = syncResults;

            return jsonResponse({ success: true, code_id: newCode.id, ...results }, 200, corsHeaders);
        }

        if (action === 'update') {
            if (!body.code_id) throw new Error('code_id is required for update');

            const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
            if (code) updateFields.code = code.toUpperCase();
            if (typeof discount_percent === 'number') updateFields.discount_percent = discount_percent;
            if (platform !== undefined) updateFields.platform = platform;
            if (typeof body.active === 'boolean') updateFields.active = body.active;

            const { data: updatedCode, error: updateErr } = await supabase
                .from('partner_discount_codes')
                .update(updateFields)
                .eq('id', body.code_id)
                .eq('org_id', orgId)
                .select()
                .single();

            if (updateErr) throw new Error(`Failed to update code: ${updateErr.message}`);

            results.updated = true;
            return jsonResponse({ success: true, code_id: updatedCode.id, ...results }, 200, corsHeaders);
        }

        return jsonResponse({ success: false, error: 'Unknown action' }, 400, corsHeaders);

    } catch (error: any) {
        console.error('[sync-discount-codes] Error:', error.message);
        return jsonResponse(
            { success: false, error: error.message },
            error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            corsHeaders,
        );
    }
}));

/**
 * Sync a discount code to connected WooCommerce and/or Shopify stores.
 */
async function syncToPlatforms(
    supabase: any,
    orgId: string,
    discountCode: any,
    composioApiKey?: string,
): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const targetPlatform = discountCode.platform || 'both';

    // ── WooCommerce ─────────────────────────────────────────
    if (targetPlatform === 'woocommerce' || targetPlatform === 'both') {
        try {
            const { data: apiKeys } = await supabase
                .from('tenant_api_keys')
                .select('service, api_key')
                .eq('org_id', orgId)
                .in('service', ['woo_consumer_key', 'woo_consumer_secret', 'woo_url']);

            if (apiKeys && apiKeys.length >= 3) {
                const keyMap: Record<string, string> = {};
                for (const k of apiKeys) keyMap[k.service] = k.api_key;

                const basicAuth = btoa(`${keyMap['woo_consumer_key']}:${keyMap['woo_consumer_secret']}`);

                const wcRes = await fetch(
                    `${keyMap['woo_url']}/wp-json/wc/v3/coupons`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Basic ${basicAuth}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            code: discountCode.code,
                            discount_type: 'percent',
                            amount: String(discountCode.discount_percent),
                            individual_use: false,
                            exclude_sale_items: false,
                        }),
                    }
                );

                if (wcRes.ok) {
                    const wcCoupon = await wcRes.json();
                    // Store WooCommerce coupon ID
                    await supabase
                        .from('partner_discount_codes')
                        .update({ platform_coupon_id: `woo:${wcCoupon.id}` })
                        .eq('id', discountCode.id);

                    results.woocommerce = { synced: true, coupon_id: wcCoupon.id };
                } else {
                    const errText = await wcRes.text();
                    results.woocommerce = { synced: false, error: errText.slice(0, 200) };
                }
            } else {
                results.woocommerce = { synced: false, error: 'WooCommerce not connected' };
            }
        } catch (err: any) {
            results.woocommerce = { synced: false, error: err.message };
        }
    }

    // ── Shopify ─────────────────────────────────────────────
    if ((targetPlatform === 'shopify' || targetPlatform === 'both') && composioApiKey) {
        try {
            const { data: connection } = await supabase
                .from('tenant_connections')
                .select('composio_connection_id, status')
                .eq('org_id', orgId)
                .eq('service', 'shopify')
                .single();

            if (connection?.status === 'connected' && connection.composio_connection_id) {
                // Use Shopify GraphQL via Composio to create price rule + discount code
                const graphqlMutation = `
                    mutation {
                        priceRuleCreate(priceRule: {
                            title: "${discountCode.code}"
                            target: LINE_ITEM
                            allocationMethod: ACROSS
                            customerSelection: { forAllCustomers: true }
                            validityPeriod: { start: "${new Date().toISOString()}" }
                            value: { percentageValue: -${discountCode.discount_percent} }
                        }) {
                            priceRule { id legacyResourceId }
                            priceRuleUserErrors { field message }
                        }
                    }
                `;

                const composioRes = await fetch(
                    'https://backend.composio.dev/api/v2/actions/SHOPIFY_GRAPH_QL_QUERY/execute',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': composioApiKey,
                        },
                        body: JSON.stringify({
                            connectedAccountId: connection.composio_connection_id,
                            input: { query: graphqlMutation },
                        }),
                    }
                );

                if (composioRes.ok) {
                    const gqlData = await composioRes.json();
                    const priceRule = gqlData?.data?.priceRuleCreate?.priceRule;

                    if (priceRule?.legacyResourceId) {
                        // Now create the discount code under the price rule
                        const codeRes = await fetch(
                            'https://backend.composio.dev/api/v2/actions/SHOPIFY_CREATES_A_DISCOUNT_CODE/execute',
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': composioApiKey,
                                },
                                body: JSON.stringify({
                                    connectedAccountId: connection.composio_connection_id,
                                    input: {
                                        price_rule_id: priceRule.legacyResourceId,
                                        discount_code: { code: discountCode.code },
                                    },
                                }),
                            }
                        );

                        if (codeRes.ok) {
                            const shopifyCodeId = priceRule.legacyResourceId;
                            // Append Shopify ID to platform_coupon_id
                            const existingPlatformId = discountCode.platform_coupon_id || '';
                            const newPlatformId = existingPlatformId
                                ? `${existingPlatformId},shopify:${shopifyCodeId}`
                                : `shopify:${shopifyCodeId}`;

                            await supabase
                                .from('partner_discount_codes')
                                .update({ platform_coupon_id: newPlatformId })
                                .eq('id', discountCode.id);

                            results.shopify = { synced: true, price_rule_id: shopifyCodeId };
                        } else {
                            results.shopify = { synced: false, error: 'Failed to create discount code under price rule' };
                        }
                    } else {
                        const errors = gqlData?.data?.priceRuleCreate?.priceRuleUserErrors;
                        results.shopify = { synced: false, error: errors?.[0]?.message || 'Failed to create price rule' };
                    }
                } else {
                    const errText = await composioRes.text();
                    results.shopify = { synced: false, error: errText.slice(0, 200) };
                }
            } else {
                results.shopify = { synced: false, error: 'Shopify not connected' };
            }
        } catch (err: any) {
            results.shopify = { synced: false, error: err.message };
        }
    }

    return results;
}

/**
 * Delete a coupon from the connected platform(s).
 */
async function deletePlatformCoupon(
    supabase: any,
    orgId: string,
    discountCode: any,
    composioApiKey?: string,
): Promise<void> {
    const platformIds = (discountCode.platform_coupon_id || '').split(',').filter(Boolean);

    for (const pid of platformIds) {
        try {
            if (pid.startsWith('woo:')) {
                const wcCouponId = pid.replace('woo:', '');
                const { data: apiKeys } = await supabase
                    .from('tenant_api_keys')
                    .select('service, api_key')
                    .eq('org_id', orgId)
                    .in('service', ['woo_consumer_key', 'woo_consumer_secret', 'woo_url']);

                if (apiKeys && apiKeys.length >= 3) {
                    const keyMap: Record<string, string> = {};
                    for (const k of apiKeys) keyMap[k.service] = k.api_key;
                    const basicAuth = btoa(`${keyMap['woo_consumer_key']}:${keyMap['woo_consumer_secret']}`);

                    await fetch(
                        `${keyMap['woo_url']}/wp-json/wc/v3/coupons/${wcCouponId}?force=true`,
                        {
                            method: 'DELETE',
                            headers: { 'Authorization': `Basic ${basicAuth}` },
                        }
                    );
                }
            } else if (pid.startsWith('shopify:') && composioApiKey) {
                const shopifyPriceRuleId = pid.replace('shopify:', '');
                const { data: connection } = await supabase
                    .from('tenant_connections')
                    .select('composio_connection_id')
                    .eq('org_id', orgId)
                    .eq('service', 'shopify')
                    .single();

                if (connection?.composio_connection_id) {
                    await fetch(
                        'https://backend.composio.dev/api/v2/actions/SHOPIFY_DELETE_PRICE_RULE/execute',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': composioApiKey,
                            },
                            body: JSON.stringify({
                                connectedAccountId: connection.composio_connection_id,
                                input: { price_rule_id: shopifyPriceRuleId },
                            }),
                        }
                    );
                }
            }
        } catch (err: any) {
            console.error(`[sync-discount-codes] Failed to delete platform coupon ${pid}: ${err.message}`);
        }
    }
}
