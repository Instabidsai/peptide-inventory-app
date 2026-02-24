import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { isValidEmail, isValidUuid } from "../_shared/validate.ts";

const VERSION = "2.0.0"; // Auth + rate limiting + validation

Deno.serve(async (req) => {
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

        const { email, contact_id, tier, redirect_origin, role, parent_rep_id } = await req.json();

        // Validate inputs
        if (!email || !isValidEmail(email)) {
            return jsonResponse({ error: 'Valid email is required' }, 400, corsHeaders);
        }
        if (contact_id && !isValidUuid(contact_id)) {
            return jsonResponse({ error: 'Invalid contact_id' }, 400, corsHeaders);
        }
        if (parent_rep_id && !isValidUuid(parent_rep_id)) {
            return jsonResponse({ error: 'Invalid parent_rep_id' }, 400, corsHeaders);
        }

        console.log(`[${VERSION}] Processing invite for: ${email} as ${role || 'client'} (by ${user.email})`);

        const claimToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const baseUrl = redirect_origin || Deno.env.get('PUBLIC_SITE_URL') || '';
        const safeLink = `${baseUrl}/join?token=${claimToken}`;

        // Update Contact with Token — scope to caller's org
        if (contact_id) {
            const { error: updateError } = await supabase
                .from('contacts')
                .update({
                    claim_token: claimToken,
                    claim_token_expires_at: expiresAt,
                    invite_link: safeLink,
                    tier: tier || 'family',
                })
                .eq('id', contact_id)
                .eq('org_id', orgId);

            if (updateError) {
                console.warn('Claim token update failed (non-fatal):', JSON.stringify(updateError));
            }
        }

        // Create user if not exists
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: { role: role || 'client' },
        });

        let userId: string | undefined;

        if (createData?.user) {
            userId = createData.user.id;
        } else if (createError?.message?.includes('already registered')) {
            // Look up by email — filter efficiently with perPage: 1
            // Supabase admin API doesn't support email filter, but we can
            // check auth.users via a direct query with service role
            const { data: existingUser } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', email.toLowerCase())
                .limit(1)
                .maybeSingle();

            if (existingUser) {
                userId = existingUser.user_id;
            } else {
                // Fallback: paginated search (bounded)
                const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
                const found = userList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
                if (found) userId = found.id;
            }
        } else if (createError) {
            console.error('User creation error:', createError);
            return jsonResponse({ error: `User creation failed: ${createError.message}` }, 500, corsHeaders);
        }

        // Link to parent rep if provided
        if (parent_rep_id && userId) {
            console.log(`Linking User ${userId} to Parent Rep ${parent_rep_id}`);
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    parent_rep_id: parent_rep_id,
                    role: role || 'sales_rep',
                    partner_tier: 'standard',
                })
                .eq('user_id', userId);

            if (profileError) console.error("Failed to link parent rep:", profileError);
        }

        return jsonResponse({
            success: true,
            version: VERSION,
            action_link: safeLink,
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
});
