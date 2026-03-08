import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Notify tenant admins via SMS when a new order arrives in the fulfillment queue.
 *
 * Called by a database trigger on sales_orders INSERT (via pg_net),
 * or directly from admin UI / other edge functions.
 *
 * POST body: { org_id: uuid, order_id?: uuid, customer_name?: string, total_amount?: number, source?: string }
 *
 * If customer_name is not provided but order_id is, the function looks it up
 * from the order's client_id → contacts.full_name.
 *
 * Auth: admin JWT OR service-role key (for DB trigger / server-to-server calls)
 *
 * Reads tenant_config.order_sms_enabled + order_sms_phones to determine
 * which phone numbers to notify. Each phone entry is:
 *   { phone: string, label: string, enabled: boolean }
 *
 * Required env vars:
 *   TEXTBELT_API_KEY — for sending SMS
 */

interface SmsPhone {
    phone: string;
    label: string;
    enabled: boolean;
}

Deno.serve(withErrorReporting("notify-order", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        let supabase;
        let orgId: string;

        // Dual auth: service-role JWT OR admin JWT
        const authHeader = req.headers.get("Authorization");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const sbUrl = Deno.env.get("SUPABASE_URL");
        const token = authHeader?.replace("Bearer ", "") || "";

        // Check if token is a service_role JWT (from DB trigger via pg_net or direct server call)
        let isServiceRole = false;
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split(".")[1]));
                if (payload.role === "service_role") isServiceRole = true;
            } catch { /* not a JWT, fall through */ }
        }

        if (isServiceRole && serviceKey) {
            supabase = createClient(sbUrl!, serviceKey);
            orgId = "";
        } else {
            const auth = await authenticateRequest(req, {
                requireRole: ['admin', 'staff', 'super_admin'],
            });
            supabase = auth.supabase;
            orgId = auth.orgId;
        }

        const textbeltKey = Deno.env.get("TEXTBELT_API_KEY");
        if (!textbeltKey) {
            return jsonResponse({ ok: false, error: "TEXTBELT_API_KEY not set" }, 500, corsHeaders);
        }

        const body = await req.json();
        const effectiveOrgId = orgId || body.org_id;

        if (!effectiveOrgId) {
            return jsonResponse({ error: "org_id required" }, 400, corsHeaders);
        }

        // Read tenant SMS config
        const { data: config } = await supabase
            .from("tenant_config")
            .select("order_sms_enabled, order_sms_phones, brand_name")
            .eq("org_id", effectiveOrgId)
            .maybeSingle();

        if (!config?.order_sms_enabled) {
            return jsonResponse({ ok: true, skipped: true, reason: "SMS notifications disabled" }, 200, corsHeaders);
        }

        const phones: SmsPhone[] = config.order_sms_phones || [];
        const activePhones = phones.filter((p) => p.enabled && p.phone);

        if (activePhones.length === 0) {
            return jsonResponse({ ok: true, skipped: true, reason: "No active phone numbers configured" }, 200, corsHeaders);
        }

        // Look up customer name from order if not provided
        let customerName = body.customer_name || "";
        if (!customerName && body.order_id) {
            const { data: order } = await supabase
                .from("sales_orders")
                .select("client_id")
                .eq("id", body.order_id)
                .maybeSingle();
            if (order?.client_id) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("full_name")
                    .eq("id", order.client_id)
                    .maybeSingle();
                customerName = contact?.full_name || "";
            }
        }
        customerName = customerName || "a customer";

        // Build a SHORT notification message to conserve SMS API credits.
        // Do NOT include order details (items, total, payment method, source).
        // The dashboard has all the details — this is just an alert.
        const brandName = config.brand_name || "Your store";
        const msg = `${brandName}: New activity from ${customerName} — check your dashboard`;

        let notified = 0;
        const errors: string[] = [];
        const textbeltResponses: object[] = [];

        for (const entry of activePhones) {
            try {
                const resp = await fetch("https://textbelt.com/text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        phone: entry.phone,
                        message: msg,
                        key: textbeltKey,
                    }),
                });
                const result = await resp.json();
                textbeltResponses.push({ phone: entry.label || entry.phone, ...result });
                if (result.success) {
                    notified++;
                } else {
                    errors.push(`SMS to ${entry.label || entry.phone} failed: ${result.error || "unknown"}`);
                }
            } catch (smsErr) {
                errors.push(`SMS to ${entry.label || entry.phone} error: ${(smsErr as Error).message}`);
            }
        }

        return jsonResponse({
            ok: true,
            notified,
            total_phones: activePhones.length,
            errors: errors.length > 0 ? errors : undefined,
            textbelt_debug: textbeltResponses,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("notify-order error:", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
}));
