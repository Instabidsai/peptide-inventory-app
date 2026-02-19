import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VERSION = "1.0.0"; // Direct Promote — no invite links

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
        const { contact_id, contact_name, contact_email, parent_rep_id } = await req.json()

        if (!contact_id) throw new Error('contact_id is required')

        // Generate a placeholder email if none provided
        const shortId = contact_id.slice(0, 8)
        const safeName = (contact_name || 'partner').toLowerCase().replace(/[^a-z0-9]/g, '')
        const email = contact_email && contact_email.includes('@')
            ? contact_email
            : `${safeName}.${shortId}@partner.internal`

        console.log(`[${VERSION}] Promoting contact ${contact_id} (${contact_name}) with email: ${email}`)

        // Step 1: Create auth user (or find existing)
        let userId: string | undefined

        const { data: createData, error: createError } = await supabaseClient.auth.admin.createUser({
            email: email,
            email_confirm: true,
            password: crypto.randomUUID(), // Random password — they won't log in with it
            user_metadata: { role: 'sales_rep', contact_name: contact_name }
        })

        if (createData?.user) {
            userId = createData.user.id
            console.log(`Created new auth user: ${userId}`)
        } else if (createError?.message?.includes('already registered')) {
            // User already exists — find them
            const { data: foundUsers } = await supabaseClient.auth.admin.listUsers()
            const existing = foundUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
            if (existing) {
                userId = existing.id
                console.log(`Found existing auth user: ${userId}`)
            }
        } else if (createError) {
            console.error('Failed to create auth user:', createError)
            throw new Error(`Auth user creation failed: ${createError.message}`)
        }

        if (!userId) {
            throw new Error('Could not create or find auth user')
        }

        // Step 2: Check if profile exists
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

        if (existingProfile) {
            // Update existing profile
            console.log(`Updating existing profile: ${existingProfile.id}`)
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({
                    role: 'sales_rep',
                    parent_rep_id: parent_rep_id || null,
                    partner_tier: 'standard',
                    commission_rate: 0.10,
                    full_name: contact_name,
                    email: email,
                })
                .eq('id', existingProfile.id)

            if (updateError) {
                console.error('Profile update error:', updateError)
                throw new Error(`Profile update failed: ${updateError.message}`)
            }
        } else {
            // INSERT new profile
            console.log(`Creating new profile for user: ${userId}`)

            // Get org_id from parent rep if available
            let orgId: string | null = null
            if (parent_rep_id) {
                const { data: parentProfile } = await supabaseClient
                    .from('profiles')
                    .select('org_id')
                    .eq('id', parent_rep_id)
                    .maybeSingle()
                orgId = parentProfile?.org_id || null
            }

            const { error: insertError } = await supabaseClient
                .from('profiles')
                .insert({
                    user_id: userId,
                    full_name: contact_name,
                    email: email,
                    role: 'sales_rep',
                    parent_rep_id: parent_rep_id || null,
                    partner_tier: 'standard',
                    commission_rate: 0.10,
                    org_id: orgId,
                })

            if (insertError) {
                console.error('Profile insert error:', insertError)
                throw new Error(`Profile creation failed: ${insertError.message}`)
            }
        }

        // Step 3: Link contact to the auth user
        const { error: linkError } = await supabaseClient
            .from('contacts')
            .update({
                linked_user_id: userId,
                type: 'partner',
            })
            .eq('id', contact_id)

        if (linkError) {
            console.warn('Contact link warning:', linkError)
            // Non-fatal — the profile is created, partner will appear in list
        }

        // Step 4: Get the profile ID for the response
        const { data: finalProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .single()

        console.log(`[${VERSION}] Promotion complete. Profile: ${finalProfile?.id}, User: ${userId}`)

        return new Response(
            JSON.stringify({
                success: true,
                version: VERSION,
                profile_id: finalProfile?.id,
                user_id: userId,
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
