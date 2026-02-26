/**
 * ═══════════════════════════════════════════════════════════════════
 * NEW EDGE FUNCTION TEMPLATE
 * ═══════════════════════════════════════════════════════════════════
 *
 * SETUP CHECKLIST (copy this function's directory, then):
 *
 *   1. ✅ config.toml already has verify_jwt = false (copy it too!)
 *   2. Use authenticateRequest() for user-facing endpoints
 *   3. Use authenticateCron() for scheduled/cron endpoints
 *   4. Use HMAC validation for webhook endpoints
 *   5. Always call handleCors() first
 *   6. Always call handleHealthCheck() before auth
 *
 * ⚠️  NEVER set verify_jwt = true. Auth is handled in code.
 *     See config.toml comment for full explanation.
 * ═══════════════════════════════════════════════════════════════════
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors, getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest, handleHealthCheck, AuthError } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
    // 1. CORS preflight
    const preflight = handleCors(req);
    if (preflight) return preflight;

    const corsHeaders = getCorsHeaders(req);

    // 2. Health check (before auth — allows monitoring)
    const healthResp = await handleHealthCheck(req, corsHeaders, "1.0.0");
    if (healthResp) return healthResp;

    try {
        // 3. Authenticate (3-layer: header → JWT → role)
        const { user, role, orgId, supabase } = await authenticateRequest(req);

        // 4. Parse request
        const body = await req.json();

        // 5. Your logic here
        // ...

        return jsonResponse({ ok: true }, 200, corsHeaders);
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("Unhandled error:", err);
        return jsonResponse({ error: "Internal error" }, 500, corsHeaders);
    }
});
