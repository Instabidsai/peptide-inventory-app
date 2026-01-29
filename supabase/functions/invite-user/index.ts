
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VERSION = "1.4.0"; // Persistent Link Storage

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

        // STRATEGY: Scanner-Proof Claim Token
        // 1. Generate a Safe Token (UUID)
        // 2. Save it to the Contact with Expiry
        // 3. Send USER a link to /join?token=...
        // 4. User clicks -> /join calls exchange-token -> Gets real Magic Link

        const claimToken = crypto.randomUUID();
        // 7 Day Expiry
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const baseUrl = redirect_origin || Deno.env.get('PUBLIC_SITE_URL') || 'https://app.thepeptideai.com';
        const safeLink = `${baseUrl}/join?token=${claimToken}`;

        // Update Contact with Token
        const { error: updateError } = await supabaseClient
            .from('contacts')
            .update({
                claim_token: claimToken,
                claim_token_expires_at: expiresAt,
                invite_link: safeLink, // Save safe link for reference
                tier: tier || 'family'
            })
            .eq('id', contact_id);

        if (updateError) {
            // If this fails, it's likely the Migration hasn't been run yet.
            console.error('Update Claim Token Failed:', updateError);
            throw new Error('Database Schema Mismatch: Please run migration 20260121111500_add_claim_token.sql');
        }

        // We also want to ensure the user exists in Auth, even if we don't log them in yet.
        // This ensures the exchange-step doesn't have to create users (which is slower).
        // Try to get user by email
        const { data: userList } = await supabaseClient.auth.admin.listUsers();
        // Note: listUsers is paginated, relying on exact email search is better if available, 
        // but createUser is idempotent-ish if we handle error.

        // Actually, easiest way: Try to create. If exists, good.
        const { error: createError } = await supabaseClient.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: { role: role || 'client' }
        });

        if (createError && !createError.message?.includes('already registered')) {
            console.error('User creation warning:', createError);
            // proceed anyway, maybe they exist
        }

        // If parent_rep_id is provided, we need to link the new user's profile to it.
        if (parent_rep_id) {
            // 1. Get the user ID (either from creation or lookup)
            const { data: userData } = await supabaseClient.auth.admin.listUsers();
            // This is inefficient but we need the ID. Ideally we use the ID returned from createUser if success.
            // Let's optimize: if createError is null, we have the ID.

            let userId: string | undefined;

            // First, try to get ID from list by email to be sure
            // Because createUser response structure is { data: { user: ... } }
            // Let's actually use the response from createUser if possible, but listUsers is safer for "already exists" case.
            // Actually, we can just search precisely.
            const { data: users } = await supabaseClient.from('auth.users').select('id').eq('email', email).maybeSingle();
            // wait, we can't select from auth.users via generic client easily without service role + special config sometimes.
            // Best to use auth admin api

            // Re-fetch strict
            const { data: foundUsers, error: listError } = await supabaseClient.auth.admin.listUsers();
            // listUsers doesn't filter by email in args? No.
            // We have to iterate.
            const specificUser = foundUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

            if (specificUser) {
                userId = specificUser.id;
                console.log(`Linking User ${userId} to Parent Rep ${parent_rep_id}`);

                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .update({
                        parent_rep_id: parent_rep_id,
                        role: role || 'sales_rep', // Ensure role is set if upgrading
                        partner_tier: 'standard' // Default tier
                    })
                    .eq('id', userId); // profiles.id usually matches user.id

                if (profileError) console.error("Failed to link parent rep:", profileError);
            } else {
                console.error("User created/invited but not found for linking.");
            }
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
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            },
        )
    }
})
