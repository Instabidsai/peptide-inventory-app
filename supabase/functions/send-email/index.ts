import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { isValidEmail, sanitizeString } from "../_shared/validate.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * send-email — Supabase Edge Function
 * Called by: run-automations (action_type: "email"), or admin/staff users.
 * POST body: { to, subject, html, org_id, from_name, from_email, reply_to }
 * Uses Resend API for delivery.
 */

const RESEND_URL = "https://api.resend.com/emails";

/** Resolve Resend API key: env var -> platform_config table */
async function getResendKey(): Promise<string> {
    const envKey = Deno.env.get("RESEND_API_KEY");
    if (envKey) return envKey;

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        const { data } = await sb
            .from("platform_config")
            .select("value")
            .eq("key", "RESEND_API_KEY")
            .single();
        return data?.value || "";
    } catch {
        return "";
    }
}

Deno.serve(withErrorReporting("send-email", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    try {
        // Auth: require admin or staff
        const { user, orgId, supabase } = await authenticateRequest(req, {
            requireRole: ['admin', 'staff', 'super_admin'],
        });

        // Rate limit: 20 emails/min per user
        const rl = checkRateLimit(user.id, { maxRequests: 20, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        const body = await req.json();
        const { to, subject, html, from_name, from_email, reply_to } = body;

        // Validate required fields
        if (!to || !subject || !html) {
            return jsonResponse({ error: "to, subject, and html are required" }, 400, corsHeaders);
        }

        // Validate email recipients
        const recipients = Array.isArray(to) ? to : [to];
        for (const recipient of recipients) {
            if (!isValidEmail(recipient)) {
                return jsonResponse({ error: `Invalid email: ${recipient}` }, 400, corsHeaders);
            }
        }

        const cleanSubject = sanitizeString(subject, 200) || "Notification";

        // Fetch tenant branding for from address — scoped to caller's org
        let senderName = from_name || "Peptide Portal";
        let senderEmail = from_email || "noreply@thepeptideai.com";

        if (orgId) {
            const { data: config } = await supabase
                .from("tenant_config")
                .select("brand_name, support_email")
                .eq("org_id", orgId)
                .single();

            if (config?.brand_name) senderName = config.brand_name;
            if (config?.support_email) senderEmail = config.support_email;
        }

        const resendKey = await getResendKey();
        if (!resendKey) {
            console.log(`[send-email] No RESEND_API_KEY — would send "${cleanSubject}" to ${recipients.join(', ')}`);
            return jsonResponse(
                { sent: false, queued: true, note: "No RESEND_API_KEY configured" },
                200, corsHeaders,
            );
        }

        const response = await fetch(RESEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
                from: `${senderName} <${senderEmail}>`,
                to: recipients,
                reply_to: reply_to || senderEmail,
                subject: cleanSubject,
                html,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("[send-email] Resend error:", response.status, errText);
            return jsonResponse(
                { error: "Email delivery failed", detail: errText },
                502, corsHeaders,
            );
        }

        const result = await response.json();
        return jsonResponse({ sent: true, id: result.id }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[send-email] Error:", err);
        return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
    }
}));
