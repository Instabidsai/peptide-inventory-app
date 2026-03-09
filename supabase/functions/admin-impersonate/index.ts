/**
 * admin-impersonate — Mint a real JWT session for a target user.
 *
 * Allows admin/super_admin/staff to impersonate a user in their org by
 * generating a real Supabase session (access_token + refresh_token).
 * The frontend swaps its session so RLS, edge functions, and all
 * permission checks evaluate as the target user.
 *
 * Security:
 *   - Caller must be admin, super_admin, or staff
 *   - Target must be in the same org (super_admin exempted)
 *   - Cannot impersonate vendor or super_admin roles (no privilege escalation)
 */

import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  try {
    // 1. Authenticate the caller — must be admin, super_admin, or staff
    const { user: caller, role: callerRole, orgId: callerOrgId, supabase } =
      await authenticateRequest(req, {
        requireRole: ["admin", "super_admin", "staff"],
      });

    // 2. Parse request body
    const { targetUserId } = await req.json();
    if (!targetUserId) {
      throw new AuthError("targetUserId is required", 400);
    }

    // 3. Look up the target user's role and org
    const { data: targetRole, error: roleErr } = await supabase
      .from("user_roles")
      .select("role, org_id")
      .eq("user_id", targetUserId)
      .single();

    if (roleErr || !targetRole) {
      throw new AuthError("Target user not found or has no role", 404);
    }

    // 4. Security: prevent privilege escalation
    const blockedRoles = ["vendor", "super_admin"];
    if (blockedRoles.includes(targetRole.role)) {
      throw new AuthError(
        `Cannot impersonate ${targetRole.role} — privilege escalation blocked`,
        403
      );
    }

    // 5. Security: same-org check (super_admin can impersonate any org)
    if (callerRole !== "super_admin" && targetRole.org_id !== callerOrgId) {
      throw new AuthError(
        "Cannot impersonate users outside your organization",
        403
      );
    }

    // 6. Get the target user's email from auth.users
    const { data: targetAuth, error: authErr } =
      await supabase.auth.admin.getUserById(targetUserId);

    if (authErr || !targetAuth?.user?.email) {
      throw new AuthError("Target user has no email — cannot impersonate", 404);
    }

    const targetEmail = targetAuth.user.email;

    // 7. Generate a magic link (server-side only — never sent to user)
    const { data: linkData, error: linkErr } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });

    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new AuthError(
        `Failed to generate session: ${linkErr?.message || "no token"}`,
        500
      );
    }

    // 8. Exchange the hashed token for a real session
    //    Use a fresh anon client (not service-role) for verifyOtp
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const sbUrl = Deno.env.get("SUPABASE_URL");
    if (!anonKey || !sbUrl) {
      throw new AuthError("Server misconfigured: missing anon key", 500);
    }

    const anonClient = createClient(sbUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });

    if (otpErr || !otpData?.session) {
      throw new AuthError(
        `Failed to mint session: ${otpErr?.message || "no session returned"}`,
        500
      );
    }

    // 9. Return the real session tokens
    return jsonResponse(
      {
        access_token: otpData.session.access_token,
        refresh_token: otpData.session.refresh_token,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 400;
    return jsonResponse(
      { error: err.message || "Unknown error" },
      status,
      corsHeaders
    );
  }
});
