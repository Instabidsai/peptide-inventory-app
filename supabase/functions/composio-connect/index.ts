import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

interface ConnectRequest {
    service: string;   // 'stripe', 'gmail', 'sheets', 'shopify'
    org_id: string;
}

// Map service names to Composio app IDs
const SERVICE_TO_APP: Record<string, string> = {
    stripe: 'stripe',
    gmail: 'gmail',
    sheets: 'googlesheets',
    shopify: 'shopify',
    drive: 'googledrive',
    notion: 'notion',
};

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

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

        const body: ConnectRequest = await req.json();
        if (!body.service || !body.org_id) {
            throw new Error('Required: service, org_id');
        }

        // Verify caller is admin of this org
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('org_id', body.org_id)
            .single();

        if (!callerRole || !['admin', 'super_admin'].includes(callerRole.role)) {
            throw new Error('Forbidden: admin role required');
        }

        const appName = SERVICE_TO_APP[body.service];
        if (!appName) {
            throw new Error(`Unsupported service: ${body.service}. Supported: ${Object.keys(SERVICE_TO_APP).join(', ')}`);
        }

        // Create or get Composio entity for this org
        // user_id in Composio = org_id in our system (tenant isolation)
        const entityId = body.org_id;

        // Generate state token for callback validation (CSRF protection)
        const stateToken = crypto.randomUUID();

        // Request OAuth redirect URL from Composio
        const connectRes = await fetch('https://backend.composio.dev/api/v1/connectedAccounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': composioApiKey,
            },
            body: JSON.stringify({
                integrationId: appName,
                userUuid: entityId,
                redirectUri: `${sbUrl}/functions/v1/composio-callback?org_id=${body.org_id}&service=${body.service}&state=${stateToken}`,
            }),
        });

        if (!connectRes.ok) {
            const errText = await connectRes.text();
            throw new Error(`Composio API error: ${connectRes.status} — ${errText}`);
        }

        const connectData = await connectRes.json();

        // Store pending connection with state token
        await supabase
            .from('tenant_connections')
            .upsert({
                org_id: body.org_id,
                service: body.service,
                status: 'pending',
                state_token: stateToken,
                composio_connection_id: connectData.connectedAccountId || null,
                metadata: { initiated_by: user.id, initiated_at: new Date().toISOString() },
            }, { onConflict: 'org_id,service' });

        return new Response(
            JSON.stringify({
                success: true,
                redirect_url: connectData.redirectUrl || connectData.connectionUrl,
                connection_id: connectData.connectedAccountId,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error('[composio-connect] Error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            }
        );
    }
});
