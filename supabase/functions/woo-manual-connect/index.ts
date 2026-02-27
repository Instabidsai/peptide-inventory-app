import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * WooCommerce Manual Connect — paste consumer key + secret.
 *
 * The merchant (or Justin on their behalf) generates API keys in
 * WooCommerce → Settings → Advanced → REST API, then pastes them here.
 * We store the keys and auto-create the webhook on their store.
 *
 * POST body: { store_url, consumer_key, consumer_secret, org_id }
 */

const APP_ORIGINS = [
    'https://thepeptideai.com',
    'https://app.thepeptideai.com',
    'https://www.thepeptideai.com',
    'http://localhost:5173',
    'http://localhost:8080',
];
const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...APP_ORIGINS, ...envOrigins])];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

Deno.serve(withErrorReporting("woo-manual-connect", async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

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

        const body = await req.json();
        const { store_url, consumer_key, consumer_secret, org_id } = body;

        if (!store_url || !consumer_key || !consumer_secret || !org_id) {
            throw new Error('Required: store_url, consumer_key, consumer_secret, org_id');
        }

        // Verify caller is admin of this org
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('org_id', org_id)
            .single();

        if (!callerRole || !['admin', 'super_admin'].includes(callerRole.role)) {
            throw new Error('Forbidden: admin role required');
        }

        // Normalize store URL
        let storeUrl = store_url.trim();
        if (!storeUrl.startsWith('http://') && !storeUrl.startsWith('https://')) {
            storeUrl = 'https://' + storeUrl;
        }
        storeUrl = storeUrl.replace(/\/+$/, '');

        // Validate URL
        try { new URL(storeUrl); } catch {
            throw new Error('Invalid store URL');
        }

        // First, verify the keys actually work by hitting the WC REST API
        const basicAuth = btoa(`${consumer_key}:${consumer_secret}`);
        let keysValid = false;
        try {
            const testRes = await fetch(`${storeUrl}/wp-json/wc/v3/system_status`, {
                headers: { 'Authorization': `Basic ${basicAuth}` },
            });
            keysValid = testRes.ok || testRes.status === 200;
            if (!keysValid) {
                // Try a simpler endpoint
                const testRes2 = await fetch(`${storeUrl}/wp-json/wc/v3`, {
                    headers: { 'Authorization': `Basic ${basicAuth}` },
                });
                keysValid = testRes2.ok;
            }
        } catch (fetchErr: any) {
            console.error(`[woo-manual-connect] Key validation fetch error: ${fetchErr.message}`);
            // Don't fail — the store might block system_status but allow webhooks
            keysValid = true; // Proceed anyway, webhook creation will be the real test
        }

        console.log(`[woo-manual-connect] Keys for ${storeUrl}: valid=${keysValid}`);

        // Store consumer key & secret in tenant_api_keys
        const keyUpserts = [
            { org_id, service: 'woo_consumer_key', api_key: consumer_key, api_key_masked: consumer_key.slice(0, 10) + '...' },
            { org_id, service: 'woo_consumer_secret', api_key: consumer_secret, api_key_masked: consumer_secret.slice(0, 10) + '...' },
            { org_id, service: 'woo_url', api_key: storeUrl, api_key_masked: storeUrl },
        ];

        for (const entry of keyUpserts) {
            const { error } = await supabase
                .from('tenant_api_keys')
                .upsert(entry, { onConflict: 'org_id,service' });
            if (error) console.error(`[woo-manual-connect] Failed to store ${entry.service}:`, error.message);
        }

        // Auto-create webhook on their WooCommerce store
        const webhookSecret = generateHexSecret(32);
        const webhookDeliveryUrl = `${sbUrl}/functions/v1/woo-webhook?org_id=${org_id}`;

        let webhookCreated = false;
        let webhookError = '';
        try {
            const wcRes = await fetch(`${storeUrl}/wp-json/wc/v3/webhooks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${basicAuth}`,
                },
                body: JSON.stringify({
                    name: 'ThePeptideAI Order Sync',
                    topic: 'order.updated',
                    delivery_url: webhookDeliveryUrl,
                    secret: webhookSecret,
                    status: 'active',
                }),
            });

            if (wcRes.ok) {
                webhookCreated = true;
                const wcData = await wcRes.json();
                console.log(`[woo-manual-connect] Auto-created webhook #${wcData.id} on ${storeUrl}`);
            } else {
                const errText = await wcRes.text();
                webhookError = `${wcRes.status}: ${errText.slice(0, 200)}`;
                console.error(`[woo-manual-connect] Failed to create webhook on ${storeUrl}: ${webhookError}`);
            }
        } catch (fetchErr: any) {
            webhookError = fetchErr.message;
            console.error(`[woo-manual-connect] Network error creating webhook: ${fetchErr.message}`);
        }

        // Store webhook secret
        await supabase
            .from('tenant_api_keys')
            .upsert({
                org_id,
                service: 'woo_webhook_secret',
                api_key: webhookSecret,
                api_key_masked: webhookSecret.slice(0, 8) + '...' + webhookSecret.slice(-4),
            }, { onConflict: 'org_id,service' });

        // Update connection status
        await supabase
            .from('tenant_connections')
            .upsert({
                org_id,
                service: 'woocommerce',
                status: 'connected',
                state_token: null,
                connected_at: new Date().toISOString(),
                metadata: {
                    store_url: storeUrl,
                    connected_via: 'manual_keys',
                    connected_at: new Date().toISOString(),
                    connected_by: user.id,
                    webhook_created: webhookCreated,
                    webhook_delivery_url: webhookDeliveryUrl,
                    webhook_error: webhookError || undefined,
                },
            }, { onConflict: 'org_id,service' });

        // Create notification
        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('org_id', org_id)
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle();

        await supabase.from('notifications').insert({
            org_id,
            user_id: adminProfile?.user_id || null,
            type: 'integration',
            title: 'WooCommerce Connected!',
            message: webhookCreated
                ? 'Your WooCommerce store is connected. Orders will sync automatically.'
                : 'Your WooCommerce store is connected but the webhook could not be auto-created. You may need to add it manually.',
        }).catch(() => {});

        console.log(`[woo-manual-connect] Connected for org ${org_id} (webhook=${webhookCreated})`);

        return new Response(JSON.stringify({
            success: true,
            webhook_created: webhookCreated,
            webhook_error: webhookError || undefined,
            store_url: storeUrl,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[woo-manual-connect] Error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            },
        );
    }
}));

function generateHexSecret(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
