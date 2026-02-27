import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

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

interface WooConnectRequest {
    store_url: string;
    org_id: string;
}

Deno.serve(withErrorReporting("woo-connect", async (req) => {
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

        const body: WooConnectRequest = await req.json();
        if (!body.store_url || !body.org_id) {
            throw new Error('Required: store_url, org_id');
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

        // Normalize store URL
        let storeUrl = body.store_url.trim();
        if (!storeUrl.startsWith('http://') && !storeUrl.startsWith('https://')) {
            storeUrl = 'https://' + storeUrl;
        }
        storeUrl = storeUrl.replace(/\/+$/, ''); // strip trailing slashes

        // Basic URL validation
        try {
            new URL(storeUrl);
        } catch {
            throw new Error('Invalid store URL. Enter your WooCommerce store domain (e.g. mystore.com)');
        }

        // Generate state token for CSRF protection
        const stateToken = crypto.randomUUID();

        // Store pending connection
        await supabase
            .from('tenant_connections')
            .upsert({
                org_id: body.org_id,
                service: 'woocommerce',
                status: 'pending',
                state_token: stateToken,
                metadata: {
                    store_url: storeUrl,
                    initiated_by: user.id,
                    initiated_at: new Date().toISOString(),
                },
            }, { onConflict: 'org_id,service' });

        // Build WooCommerce auth URL
        // WooCommerce's /wc-auth/v1/authorize endpoint generates API keys via a consent screen
        const callbackBase = `${sbUrl}/functions/v1/woo-callback`;
        const params = new URLSearchParams({
            app_name: 'ThePeptideAI',
            scope: 'read_write',
            user_id: body.org_id,
            return_url: `${callbackBase}?org_id=${body.org_id}&state=${stateToken}&type=return`,
            callback_url: `${callbackBase}?org_id=${body.org_id}&state=${stateToken}&type=keys`,
        });

        const redirectUrl = `${storeUrl}/wc-auth/v1/authorize?${params.toString()}`;

        return new Response(
            JSON.stringify({
                success: true,
                redirect_url: redirectUrl,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error('[woo-connect] Error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            }
        );
    }
}));
