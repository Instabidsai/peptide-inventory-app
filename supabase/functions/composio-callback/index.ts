import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

Deno.serve(withErrorReporting("composio-callback", async (req) => {
    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

        const url = new URL(req.url);
        const orgId = url.searchParams.get('org_id');
        const service = url.searchParams.get('service');
        const stateParam = url.searchParams.get('state');
        const connectedAccountId = url.searchParams.get('connectedAccountId');
        const status = url.searchParams.get('status');

        if (!orgId || !service) {
            throw new Error('Missing org_id or service in callback');
        }

        const supabase = createClient(sbUrl, sbServiceKey);

        // Validate state token — must match a pending connection to prevent forgery
        const { data: pendingConn } = await supabase
            .from('tenant_connections')
            .select('state_token, status')
            .eq('org_id', orgId)
            .eq('service', service)
            .single();

        if (!pendingConn || pendingConn.status !== 'pending') {
            throw new Error('No pending connection found for this org/service');
        }

        if (!stateParam || pendingConn.state_token !== stateParam) {
            throw new Error('Invalid state token — possible CSRF attack');
        }

        if (status === 'failed') {
            // OAuth failed — update status
            await supabase
                .from('tenant_connections')
                .update({
                    status: 'disconnected',
                    state_token: null,
                    metadata: { error: 'OAuth flow failed', failed_at: new Date().toISOString() },
                })
                .eq('org_id', orgId)
                .eq('service', service);
        } else {
            // OAuth succeeded — store connection, clear state token (one-time use)
            const connectionMeta: Record<string, any> = { connected_at: new Date().toISOString() };

            // ── Shopify: auto-register webhooks ──────────────────
            if (service === 'shopify' && connectedAccountId) {
                const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');
                if (composioApiKey) {
                    const webhookDeliveryUrl = `${sbUrl}/functions/v1/shopify-webhook?org_id=${orgId}`;
                    const topics = ['orders/create', 'orders/updated'];
                    let webhooksCreated = 0;

                    for (const topic of topics) {
                        try {
                            const res = await fetch('https://backend.composio.dev/api/v2/actions/SHOPIFY_CREATE_WEBHOOK/execute', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': composioApiKey,
                                },
                                body: JSON.stringify({
                                    connectedAccountId,
                                    input: {
                                        webhook: {
                                            topic,
                                            address: webhookDeliveryUrl,
                                            format: 'json',
                                        },
                                    },
                                }),
                            });

                            if (res.ok) {
                                webhooksCreated++;
                                console.log(`[composio-callback] Shopify webhook registered: ${topic}`);
                            } else {
                                const errText = await res.text();
                                console.error(`[composio-callback] Failed to register Shopify webhook ${topic}: ${res.status} ${errText.slice(0, 200)}`);
                            }
                        } catch (fetchErr: any) {
                            console.error(`[composio-callback] Network error registering Shopify webhook: ${fetchErr.message}`);
                        }
                    }

                    // Generate and store webhook HMAC secret
                    const webhookSecret = generateHexSecret(32);
                    await supabase
                        .from('tenant_api_keys')
                        .upsert({
                            org_id: orgId,
                            service: 'shopify_webhook_secret',
                            api_key: webhookSecret,
                            api_key_masked: webhookSecret.slice(0, 8) + '...' + webhookSecret.slice(-4),
                        }, { onConflict: 'org_id,service' });

                    connectionMeta.webhook_created = webhooksCreated > 0;
                    connectionMeta.webhooks_registered = webhooksCreated;
                    connectionMeta.webhook_delivery_url = webhookDeliveryUrl;

                    // Create notification for admin
                    const { data: adminProfile } = await supabase
                        .from('profiles')
                        .select('user_id')
                        .eq('org_id', orgId)
                        .eq('role', 'admin')
                        .limit(1)
                        .maybeSingle();

                    await supabase.from('notifications').insert({
                        org_id: orgId,
                        user_id: adminProfile?.user_id || null,
                        type: 'integration',
                        title: 'Shopify Connected!',
                        message: webhooksCreated > 0
                            ? `Your Shopify store is connected. ${webhooksCreated} webhook(s) registered — orders will sync automatically.`
                            : 'Your Shopify store is connected. Webhooks could not be auto-created — you may need to add them manually.',
                    }).catch(() => {});
                } else {
                    console.warn('[composio-callback] COMPOSIO_API_KEY not set, skipping Shopify webhook registration');
                }
            }

            await supabase
                .from('tenant_connections')
                .update({
                    status: 'connected',
                    state_token: null,
                    composio_connection_id: connectedAccountId || null,
                    connected_at: new Date().toISOString(),
                    metadata: connectionMeta,
                })
                .eq('org_id', orgId)
                .eq('service', service);
        }

        console.log(`[composio-callback] ${service} for org ${orgId}: ${status || 'connected'}`);

        // Redirect back to app's settings page
        // The app uses HashRouter, so we redirect to the base URL with a hash route
        const appUrl = Deno.env.get('APP_URL') || sbUrl.replace('.supabase.co', '.vercel.app');
        const redirectTo = `${appUrl}/#/integrations?connected=${service}`;

        return new Response(null, {
            status: 302,
            headers: { 'Location': redirectTo },
        });

    } catch (error: any) {
        console.error('[composio-callback] Error:', error.message);
        // On error, still redirect to settings with error param
        const appUrl = Deno.env.get('APP_URL') || '';
        return new Response(null, {
            status: 302,
            headers: { 'Location': `${appUrl}/#/integrations?error=${encodeURIComponent(error.message)}` },
        });
    }
}));

function generateHexSecret(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
