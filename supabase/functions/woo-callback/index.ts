import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * WooCommerce OAuth callback handler.
 *
 * Handles TWO types of requests:
 *
 * A) Key Delivery (?type=keys) — POST from WooCommerce's server
 *    WooCommerce POSTs consumer_key and consumer_secret after merchant approves.
 *    We store the keys and auto-create a webhook on their store.
 *
 * B) User Redirect (?type=return) — GET from merchant's browser
 *    After they click Approve/Deny, WooCommerce redirects them here.
 *    We redirect back to our app with success/error params.
 */

Deno.serve(withErrorReporting("woo-callback", async (req) => {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

    const url = new URL(req.url);
    const orgId = url.searchParams.get('org_id');
    const stateParam = url.searchParams.get('state');
    const type = url.searchParams.get('type');
    const appUrl = Deno.env.get('APP_URL') || 'https://app.thepeptideai.com';

    // ── B) User Redirect (GET ?type=return) ────────────────────
    if (type === 'return' || req.method === 'GET') {
        // WooCommerce adds ?success=1 or ?success=0 to the return_url
        const success = url.searchParams.get('success');

        if (success === '0') {
            return new Response(null, {
                status: 302,
                headers: { 'Location': `${appUrl}/#/integrations?error=woocommerce_denied` },
            });
        }

        // success=1 — the key delivery POST may or may not have arrived yet.
        // Redirect back; the frontend will poll for connection status.
        return new Response(null, {
            status: 302,
            headers: { 'Location': `${appUrl}/#/integrations?connected=woocommerce` },
        });
    }

    // ── A) Key Delivery (POST ?type=keys) ──────────────────────
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        if (!orgId || !stateParam) {
            throw new Error('Missing org_id or state in callback');
        }

        const supabase = createClient(sbUrl, sbServiceKey);

        // Validate state token
        const { data: pendingConn } = await supabase
            .from('tenant_connections')
            .select('state_token, status, metadata')
            .eq('org_id', orgId)
            .eq('service', 'woocommerce')
            .single();

        if (!pendingConn || pendingConn.status !== 'pending') {
            throw new Error('No pending WooCommerce connection for this org');
        }

        if (pendingConn.state_token !== stateParam) {
            throw new Error('Invalid state token — possible CSRF attack');
        }

        // Parse WooCommerce key delivery payload
        const payload = await req.json();
        const { consumer_key, consumer_secret, key_permissions } = payload;

        if (!consumer_key || !consumer_secret) {
            throw new Error('WooCommerce did not provide API keys');
        }

        console.log(`[woo-callback] Received keys for org ${orgId}: permissions=${key_permissions}`);

        const storeUrl = pendingConn.metadata?.store_url;
        if (!storeUrl) {
            throw new Error('No store URL found in pending connection');
        }

        // Store consumer key & secret in tenant_api_keys
        const keyUpserts = [
            { org_id: orgId, service: 'woo_consumer_key', api_key: consumer_key, api_key_masked: consumer_key.slice(0, 10) + '...' },
            { org_id: orgId, service: 'woo_consumer_secret', api_key: consumer_secret, api_key_masked: consumer_secret.slice(0, 10) + '...' },
            { org_id: orgId, service: 'woo_url', api_key: storeUrl, api_key_masked: storeUrl },
        ];

        for (const entry of keyUpserts) {
            const { error } = await supabase
                .from('tenant_api_keys')
                .upsert(entry, { onConflict: 'org_id,service' });
            if (error) console.error(`[woo-callback] Failed to store ${entry.service}:`, error.message);
        }

        // Auto-create webhook on their WooCommerce store
        const webhookSecret = generateHexSecret(32);
        const webhookDeliveryUrl = `${sbUrl}/functions/v1/woo-webhook?org_id=${orgId}`;

        let webhookCreated = false;
        try {
            const basicAuth = btoa(`${consumer_key}:${consumer_secret}`);
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
                console.log(`[woo-callback] Auto-created webhook #${wcData.id} on ${storeUrl}`);
            } else {
                const errText = await wcRes.text();
                console.error(`[woo-callback] Failed to create webhook on ${storeUrl}: ${wcRes.status} ${errText}`);
            }
        } catch (fetchErr: any) {
            console.error(`[woo-callback] Network error creating webhook: ${fetchErr.message}`);
        }

        // Store webhook secret
        await supabase
            .from('tenant_api_keys')
            .upsert({
                org_id: orgId,
                service: 'woo_webhook_secret',
                api_key: webhookSecret,
                api_key_masked: webhookSecret.slice(0, 8) + '...' + webhookSecret.slice(-4),
            }, { onConflict: 'org_id,service' });

        // Update connection status
        await supabase
            .from('tenant_connections')
            .update({
                status: 'connected',
                state_token: null,
                connected_at: new Date().toISOString(),
                metadata: {
                    ...pendingConn.metadata,
                    connected_at: new Date().toISOString(),
                    webhook_created: webhookCreated,
                    webhook_delivery_url: webhookDeliveryUrl,
                },
            })
            .eq('org_id', orgId)
            .eq('service', 'woocommerce');

        // Find admin user for notification
        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle();

        // Create notification
        await supabase.from('notifications').insert({
            org_id: orgId,
            user_id: adminProfile?.user_id || null,
            type: 'integration',
            title: 'WooCommerce Connected!',
            message: webhookCreated
                ? 'Your WooCommerce store is connected. Orders will sync automatically.'
                : 'Your WooCommerce store is connected. Webhook could not be auto-created — you may need to add it manually in WooCommerce Settings > Advanced > Webhooks.',
        }).catch(() => {});

        console.log(`[woo-callback] WooCommerce connected for org ${orgId} (webhook=${webhookCreated})`);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[woo-callback] Error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }
}));

function generateHexSecret(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
