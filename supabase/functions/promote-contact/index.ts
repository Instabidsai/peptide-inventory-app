import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { isValidUuid, isValidEmail } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

const VERSION = "2.0.0"; // Auth + rate limiting + validation

Deno.serve(withErrorReporting("promote-contact", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: require admin or staff
        const { user, orgId, supabase } = await authenticateRequest(req, {
            requireRole: ['admin', 'staff', 'super_admin'],
        });

        // Rate limit: 30 req/min per user
        const rl = checkRateLimit(user.id, { maxRequests: 30, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        const { contact_id, contact_name, contact_email, parent_rep_id } = await req.json();

        // Validate inputs
        if (!contact_id || !isValidUuid(contact_id)) {
            return jsonResponse({ error: 'Valid contact_id is required' }, 400, corsHeaders);
        }
        if (parent_rep_id && !isValidUuid(parent_rep_id)) {
            return jsonResponse({ error: 'Invalid parent_rep_id' }, 400, corsHeaders);
        }

        // Verify contact belongs to caller's org
        const { data: contactCheck } = await supabase
            .from('contacts')
            .select('id, org_id')
            .eq('id', contact_id)
            .eq('org_id', orgId)
            .single();

        if (!contactCheck) {
            return jsonResponse({ error: 'Contact not found in your organization' }, 404, corsHeaders);
        }

        // Generate a placeholder email if none provided
        const shortId = contact_id.slice(0, 8);
        const safeName = (contact_name || 'partner').toLowerCase().replace(/[^a-z0-9]/g, '');
        const email = contact_email && isValidEmail(contact_email)
            ? contact_email
            : `${safeName}.${shortId}@partner.internal`;

        console.log(`[${VERSION}] Promoting contact ${contact_id} (${contact_name}) with email: ${email} (by ${user.email})`);

        // Step 1: Create auth user (or find existing)
        let userId: string | undefined;

        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            email_confirm: true,
            password: crypto.randomUUID(),
            user_metadata: { role: 'sales_rep', contact_name: contact_name },
        });

        if (createData?.user) {
            userId = createData.user.id;
            console.log(`Created new auth user: ${userId}`);
        } else if (createError?.message?.includes('already registered')) {
            // Look up by email via profiles first (fast, no pagination bomb)
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', email.toLowerCase())
                .limit(1)
                .maybeSingle();

            if (existingProfile) {
                userId = existingProfile.user_id;
            } else {
                // Bounded fallback
                const { data: foundUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
                const existing = foundUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
                if (existing) userId = existing.id;
            }
            if (userId) console.log(`Found existing auth user: ${userId}`);
        } else if (createError) {
            console.error('Failed to create auth user:', createError);
            return jsonResponse({ error: `Auth user creation failed: ${createError.message}` }, 500, corsHeaders);
        }

        if (!userId) {
            return jsonResponse({ error: 'Could not create or find auth user' }, 500, corsHeaders);
        }

        // Step 2: Check if profile exists
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (existingProfile) {
            console.log(`Updating existing profile: ${existingProfile.id}`);
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    role: 'sales_rep',
                    parent_rep_id: parent_rep_id || null,
                    partner_tier: 'standard',
                    commission_rate: 0.10,
                    full_name: contact_name,
                    email: email,
                    org_id: orgId,
                })
                .eq('id', existingProfile.id);

            if (updateError) {
                console.error('Profile update error:', updateError);
                return jsonResponse({ error: `Profile update failed: ${updateError.message}` }, 500, corsHeaders);
            }
        } else {
            console.log(`Creating new profile for user: ${userId}`);
            const { error: insertError } = await supabase
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
                });

            if (insertError) {
                console.error('Profile insert error:', insertError);
                return jsonResponse({ error: `Profile creation failed: ${insertError.message}` }, 500, corsHeaders);
            }
        }

        // Step 3: Create user_role for the org
        const { error: roleError } = await supabase
            .from('user_roles')
            .upsert({
                user_id: userId,
                org_id: orgId,
                role: 'sales_rep',
            }, { onConflict: 'user_id,org_id' });

        if (roleError) console.warn('Role upsert warning:', roleError.message);

        // Step 4: Link contact to the auth user — scoped to org
        const { error: linkError } = await supabase
            .from('contacts')
            .update({
                linked_user_id: userId,
                type: 'partner',
            })
            .eq('id', contact_id)
            .eq('org_id', orgId);

        if (linkError) {
            console.warn('Contact link warning:', linkError);
        }

        // Step 5: Get the profile ID for the response
        const { data: finalProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .single();

        console.log(`[${VERSION}] Promotion complete. Profile: ${finalProfile?.id}, User: ${userId}`);

        return jsonResponse({
            success: true,
            version: VERSION,
            profile_id: finalProfile?.id,
            user_id: userId,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error('Fatal Error:', (err as Error).message);
        return jsonResponse({
            success: false,
            version: VERSION,
            error: (err as Error).message,
        }, 500, corsHeaders);
    }
}));
