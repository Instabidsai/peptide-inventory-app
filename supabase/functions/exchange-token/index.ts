import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
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
    };
}

serve(withErrorReporting("exchange-token", async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { token } = await req.json()
        if (!token) throw new Error('Token required')

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Verify Token matches a Contact
        const { data: contacts, error: searchError } = await supabaseClient
            .from('contacts')
            .select('id, email, claim_token_expires_at')
            .eq('claim_token', token)
            .single()

        if (searchError || !contacts) {
            throw new Error('Invalid or Expired Token')
        }

        const now = new Date();
        const expiry = new Date(contacts.claim_token_expires_at);

        if (now > expiry) {
            throw new Error('Token has expired. Please ask for a new invite.')
        }

        // 2. Generate the REAL Magic Link (One-Time Use)
        const baseUrlRaw = Deno.env.get('PUBLIC_SITE_URL') || '';

        // Use URL constructor for safety (Fixes the "concatenation" bug)
        // If baseUrlRaw is "https://app...", this ensures we get "https://app.../update-password"
        const siteUrl = new URL(baseUrlRaw);
        const redirectUrlObj = new URL('/#/update-password', siteUrl);
        const redirectUrl = redirectUrlObj.toString();

        const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
            type: 'magiclink',
            email: contacts.email,
            options: {
                redirectTo: redirectUrl
            }
        })

        if (linkError) throw linkError

        // 3. Invalidate the claim token so it can't be reused
        await supabaseClient
            .from('contacts')
            .update({ claim_token: null, claim_token_expires_at: null })
            .eq('id', contacts.id)

        // 4. Return the Magic Link
        return new Response(
            JSON.stringify({
                success: true,
                url: linkData.properties.action_link,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
}))
