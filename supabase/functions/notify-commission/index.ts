import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { isValidUuid } from "../_shared/validate.ts";

/**
 * Notify partners via SMS when they earn a commission.
 * Called after process_sale_commission creates commission records.
 *
 * POST body: { sale_id: uuid }
 *
 * Required env vars:
 *   TEXTBELT_API_KEY — for sending SMS
 */

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: require admin
        const { user, orgId, supabase } = await authenticateRequest(req, {
            requireRole: ['admin', 'super_admin'],
        });

        // Rate limit: 10 req/min (commission notifications are infrequent)
        const rl = checkRateLimit(user.id, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        const textbeltKey = Deno.env.get("TEXTBELT_API_KEY");
        if (!textbeltKey) return jsonResponse({ ok: false, error: "TEXTBELT_API_KEY not set" }, 500, corsHeaders);

        const { sale_id } = await req.json();
        if (!sale_id || !isValidUuid(sale_id)) {
            return jsonResponse({ error: "Valid sale_id (UUID) required" }, 400, corsHeaders);
        }

        // Get commissions for this sale — scoped to caller's org
        const { data: commissions } = await supabase
            .from("commissions")
            .select("partner_id, amount, type")
            .eq("sale_id", sale_id);

        if (!commissions?.length) return jsonResponse({ ok: true, notified: 0 }, 200, corsHeaders);

        // Get order context — verify it belongs to caller's org
        const { data: order } = await supabase
            .from("sales_orders")
            .select("total_amount, org_id, contacts(name)")
            .eq("id", sale_id)
            .eq("org_id", orgId)
            .single();

        if (!order) return jsonResponse({ error: "Order not found in your organization" }, 404, corsHeaders);

        const customerName = (order.contacts as any)?.name || "a customer";
        const orderTotal = Number(order.total_amount || 0).toFixed(2);

        // Group by partner
        const partnerTotals: Record<string, number> = {};
        for (const c of commissions) {
            partnerTotals[c.partner_id] = (partnerTotals[c.partner_id] || 0) + Number(c.amount);
        }

        let notified = 0;
        const errors: string[] = [];

        for (const [partnerId, totalCommission] of Object.entries(partnerTotals)) {
            if (totalCommission <= 0) continue;

            // Get partner profile
            const { data: profile } = await supabase
                .from("profiles")
                .select("full_name, user_id")
                .eq("id", partnerId)
                .single();

            if (!profile) continue;

            // Find phone via linked contact — scoped to org
            const { data: contact } = await supabase
                .from("contacts")
                .select("phone")
                .eq("org_id", orgId)
                .eq("linked_user_id", profile.user_id)
                .single();

            const phone = contact?.phone;
            if (!phone) continue;

            // Get YTD commission total
            const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
            const { data: ytdData } = await supabase
                .from("commissions")
                .select("amount")
                .eq("partner_id", partnerId)
                .gte("created_at", yearStart);

            const ytdTotal = (ytdData || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);

            const firstName = (profile.full_name || "").split(" ")[0] || "Partner";
            const msg = `${firstName}, new sale! ${customerName} - $${orderTotal}. Your commission: $${totalCommission.toFixed(2)}. YTD total: $${ytdTotal.toFixed(2)}`;

            try {
                const resp = await fetch("https://textbelt.com/text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone, message: msg, key: textbeltKey }),
                });
                const result = await resp.json();
                if (result.success) notified++;
                else errors.push(`SMS to ${partnerId} failed: ${result.error || 'unknown'}`);
            } catch (smsErr) {
                errors.push(`SMS to ${partnerId} error: ${(smsErr as Error).message}`);
            }
        }

        return jsonResponse({
            ok: true,
            notified,
            errors: errors.length > 0 ? errors : undefined,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("notify-commission error:", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
});
