import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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
        const baseUrlRaw = Deno.env.get('PUBLIC_SITE_URL') || 'https://app.thepeptideai.com';
        const baseUrl = baseUrlRaw.replace(/\/$/, ''); // Remove trailing slash if present
        const redirectUrl = `${baseUrl}/update-password`;

        const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
            type: 'magiclink',
            email: contacts.email,
            options: {
                redirectTo: redirectUrl
            }
        })

        if (linkError) throw linkError

        // 3. Return the Magic Link
        return new Response(
            JSON.stringify({
                success: true,
                url: linkData.properties.action_link
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
