
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VERSION = "1.5.0"; // Optimized user lookup + CORS

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL')
        const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!sbUrl || !sbKey) throw new Error('Missing Supabase Service Key')

        const supabaseClient = createClient(sbUrl, sbKey)
        const { email, contact_id, tier, redirect_origin, role, parent_rep_id } = await req.json()

        if (!email) throw new Error('Email is required')

        console.log(`[${VERSION}] Processing invite for: ${email} as ${role || 'client'}`)

        const claimToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const baseUrl = redirect_origin || Deno.env.get('PUBLIC_SITE_URL') || '';
        const safeLink = `${baseUrl}/join?token=${claimToken}`;

        // Update Contact with Token
        const { error: updateError } = await supabaseClient
            .from('contacts')
            .update({
                claim_token: claimToken,
                claim_token_expires_at: expiresAt,
                invite_link: safeLink,
                tier: tier || 'family'
            })
            .eq('id', contact_id);

        if (updateError) {
            console.warn('Claim token update failed (non-fatal):', JSON.stringify(updateError));
        }

        // Create user if not exists — createUser returns the user on success,
        // or errors with "already registered" if they exist already.
        const { data: createData, error: createError } = await supabaseClient.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: { role: role || 'client' }
        });

        let userId: string | undefined;

        if (createData?.user) {
            // New user created successfully
            userId = createData.user.id;
        } else if (createError?.message?.includes('already registered')) {
            // User already exists — look up by email using admin API with filter
            // listUsers supports page/perPage but no email filter, so we use a single page lookup
            const { data: userList } = await supabaseClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const found = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (found) userId = found.id;
        } else if (createError) {
            console.error('User creation error:', createError);
        }

        // Link to parent rep if provided
        if (parent_rep_id && userId) {
            console.log(`Linking User ${userId} to Parent Rep ${parent_rep_id}`);
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({
                    parent_rep_id: parent_rep_id,
                    role: role || 'sales_rep',
                    partner_tier: 'standard'
                })
                .eq('user_id', userId);

            if (profileError) console.error("Failed to link parent rep:", profileError);
        }

        return new Response(
            JSON.stringify({
                success: true,
                version: VERSION,
                action_link: safeLink
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            },
        )

    } catch (error) {
        console.error('Fatal Error:', error.message)
        return new Response(
            JSON.stringify({
                success: false,
                version: VERSION,
                error: error.message
            }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: 200,
            },
        )
    }
})
