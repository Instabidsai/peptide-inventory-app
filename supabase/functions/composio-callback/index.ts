import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

        const url = new URL(req.url);
        const orgId = url.searchParams.get('org_id');
        const service = url.searchParams.get('service');
        const connectedAccountId = url.searchParams.get('connectedAccountId');
        const status = url.searchParams.get('status');

        if (!orgId || !service) {
            throw new Error('Missing org_id or service in callback');
        }

        const supabase = createClient(sbUrl, sbServiceKey);

        if (status === 'failed') {
            // OAuth failed — update status
            await supabase
                .from('tenant_connections')
                .upsert({
                    org_id: orgId,
                    service: service,
                    status: 'disconnected',
                    metadata: { error: 'OAuth flow failed', failed_at: new Date().toISOString() },
                }, { onConflict: 'org_id,service' });
        } else {
            // OAuth succeeded — store connection
            await supabase
                .from('tenant_connections')
                .upsert({
                    org_id: orgId,
                    service: service,
                    status: 'connected',
                    composio_connection_id: connectedAccountId || null,
                    connected_at: new Date().toISOString(),
                    metadata: { connected_at: new Date().toISOString() },
                }, { onConflict: 'org_id,service' });
        }

        console.log(`[composio-callback] ${service} for org ${orgId}: ${status || 'connected'}`);

        // Redirect back to app's settings page
        // The app uses HashRouter, so we redirect to the base URL with a hash route
        const appUrl = Deno.env.get('APP_URL') || sbUrl.replace('.supabase.co', '.vercel.app');
        const redirectTo = `${appUrl}/#/settings?tab=integrations&connected=${service}`;

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
            headers: { 'Location': `${appUrl}/#/settings?tab=integrations&error=${encodeURIComponent(error.message)}` },
        });
    }
});
