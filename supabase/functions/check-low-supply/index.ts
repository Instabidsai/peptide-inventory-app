import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { authenticateCron, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * check-low-supply — Daily cron that scans client_inventory,
 * calculates days of supply remaining, and creates notifications
 * + sends reorder emails when supply drops below 7 days.
 *
 * Auth: CRON_SECRET header (same as run-automations).
 * Can also be triggered manually via POST with admin JWT for testing.
 */

const LOW_THRESHOLD_DAYS = 7;
const CRITICAL_THRESHOLD_DAYS = 3;
const RESEND_URL = "https://api.resend.com/emails";

/** Resolve Resend API key: env var -> platform_config table */
async function getResendKey(): Promise<string> {
    const envKey = Deno.env.get("RESEND_API_KEY");
    if (envKey) return envKey;
    try {
        const sb = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
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

/** Build a reorder deep-link URL for the client store */
function buildReorderUrl(
    appUrl: string,
    peptideId: string,
    peptideName: string,
): string {
    const items = JSON.stringify([{ peptide_id: peptideId, peptide_name: peptideName }]);
    return `${appUrl}/store?reorder=${encodeURIComponent(items)}`;
}

/** Build the low-supply email HTML */
function buildEmailHtml(
    peptideName: string,
    daysRemaining: number,
    reorderUrl: string,
    brandName: string,
): string {
    const urgency = daysRemaining <= 0
        ? `Your <strong>${peptideName}</strong> supply is depleted.`
        : `You have approximately <strong>${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}</strong> of <strong>${peptideName}</strong> remaining.`;

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #7c3aed;">${brandName}</h2>
  </div>
  <p style="font-size: 16px; line-height: 1.6;">
    ${urgency}
  </p>
  <p style="font-size: 14px; line-height: 1.6; color: #555;">
    We've prepared your cart so you can reorder with one tap.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${reorderUrl}" style="display: inline-block; padding: 14px 32px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
      Reorder ${peptideName}
    </a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">
    This email was sent because your supply is running low. If you've already reordered, you can ignore this.
  </p>
</body>
</html>`.trim();
}

interface InventoryItem {
    id: string;
    contact_id: string;
    peptide_id: string;
    in_fridge: boolean;
    dose_amount_mg: number | null;
    dose_frequency: string | null;
    dose_interval: number | null;
    dose_off_days: number | null;
    dose_days: string[] | null;
    concentration_mg_ml: number | null;
    current_quantity_mg: number | null;
    initial_quantity_mg: number | null;
    peptides: { name: string } | null;
    contacts: { name: string; email: string | null; linked_user_id: string | null; assigned_rep_id: string | null } | null;
}

/** Calculate daily mg usage from a vial's dose schedule (mirrors supply-calculations.ts) */
function vialDailyUsage(vial: {
    dose_amount_mg?: number | null;
    dose_frequency?: string | null;
    dose_interval?: number | null;
    dose_off_days?: number | null;
    dose_days?: string[] | null;
}): number {
    const doseMg = Number(vial.dose_amount_mg) || 0;
    if (doseMg <= 0) return 0;
    switch (vial.dose_frequency) {
        case "daily":
            return doseMg;
        case "every_x_days":
            return doseMg / Math.max(1, Number(vial.dose_interval) || 2);
        case "specific_days":
            return (doseMg * Math.max(1, vial.dose_days?.length || 1)) / 7;
        case "x_on_y_off": {
            const on = Math.max(1, Number(vial.dose_interval) || 5);
            const off = Math.max(0, Number(vial.dose_off_days) || 2);
            return (doseMg * on) / (on + off);
        }
        default:
            return doseMg;
    }
}

Deno.serve(withErrorReporting("check-low-supply", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: accept CRON_SECRET or admin JWT
        let supabase;
        try {
            supabase = authenticateCron(req);
        } catch {
            // Fallback: try admin JWT auth for manual testing
            const { authenticateRequest } = await import("../_shared/auth.ts");
            const auth = await authenticateRequest(req, { requireRole: ["admin", "super_admin"] });
            supabase = auth.supabase;
        }

        // Fetch all active fridge items with dosing configured
        const { data: items, error } = await supabase
            .from("client_inventory")
            .select(`
                id, contact_id, peptide_id, in_fridge,
                dose_amount_mg, dose_frequency, dose_interval, dose_off_days, dose_days,
                concentration_mg_ml, current_quantity_mg, initial_quantity_mg,
                peptides ( name ),
                contacts ( name, email, linked_user_id, assigned_rep_id )
            `)
            .eq("in_fridge", true)
            .not("dose_amount_mg", "is", null)
            .not("dose_frequency", "is", null)
            .gt("dose_amount_mg", 0);

        if (error) {
            console.error("[check-low-supply] Query error:", error.message);
            return jsonResponse({ error: error.message }, 500, corsHeaders);
        }

        if (!items?.length) {
            return jsonResponse({ message: "No configured fridge items found", alerts: 0 }, 200, corsHeaders);
        }

        // Group items by contact + peptide for aggregation (multiple vials of same peptide)
        const groupKey = (item: InventoryItem) => `${item.contact_id}::${item.peptide_id}`;
        const groups = new Map<string, InventoryItem[]>();

        for (const item of items as InventoryItem[]) {
            const key = groupKey(item);
            const existing = groups.get(key) || [];
            existing.push(item);
            groups.set(key, existing);
        }

        // Check for recent notifications to avoid duplicates (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentNotifs } = await supabase
            .from("notifications")
            .select("id, title, user_id, created_at")
            .gte("created_at", oneDayAgo)
            .like("title", "%supply running%");

        const recentNotifKeys = new Set(
            (recentNotifs || []).map((n: { user_id: string; title: string }) =>
                `${n.user_id}::${n.title}`
            )
        );

        // Fetch tenant config for app URL + branding (for email + reorder links)
        const { data: tenantRow } = await supabase
            .from("tenant_config")
            .select("app_url, brand_name, support_email")
            .limit(1)
            .single();

        const appUrl = (tenantRow?.app_url || Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
        const brandName = tenantRow?.brand_name || "Peptide Portal";
        const senderEmail = tenantRow?.support_email || "noreply@thepeptideai.com";

        // Resolve Resend key once for all emails
        const resendKey = await getResendKey();

        const alerts: { contact: string; peptide: string; daysLeft: number; status: string }[] = [];
        const notificationsToInsert: {
            user_id: string;
            title: string;
            message: string;
            type: string;
            is_read: boolean;
            link: string | null;
        }[] = [];
        const emailsSent: string[] = [];

        for (const [, vials] of groups) {
            const first = vials[0];
            const dailyUsage = vialDailyUsage(first);
            if (dailyUsage <= 0) continue;

            // Total supply across all vials of this peptide for this contact
            const totalMg = vials.reduce((sum, v) => {
                const qty = v.current_quantity_mg ?? v.initial_quantity_mg ?? 0;
                return sum + (Number.isFinite(qty) ? qty : 0);
            }, 0);

            const daysRemaining = Math.floor(totalMg / dailyUsage);

            if (daysRemaining >= LOW_THRESHOLD_DAYS) continue;

            const peptideName = first.peptides?.name || "Unknown Peptide";
            const contactName = first.contacts?.name || "Unknown Client";
            const contactEmail = first.contacts?.email || null;
            const status = daysRemaining < CRITICAL_THRESHOLD_DAYS ? "critical" : "low";

            // Build reorder deep link
            const reorderUrl = appUrl
                ? buildReorderUrl(appUrl, first.peptide_id, peptideName)
                : null;

            alerts.push({
                contact: contactName,
                peptide: peptideName,
                daysLeft: daysRemaining,
                status,
            });

            // Notify the client (if they have a user account)
            const clientUserId = first.contacts?.linked_user_id;
            if (clientUserId) {
                const title = `${peptideName} supply running ${status}`;
                const notifKey = `${clientUserId}::${title}`;

                if (!recentNotifKeys.has(notifKey)) {
                    notificationsToInsert.push({
                        user_id: clientUserId,
                        title,
                        message:
                            daysRemaining <= 0
                                ? `Your ${peptideName} supply is depleted. Tap to reorder now!`
                                : `You have approximately ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} of ${peptideName} remaining. Tap to reorder.`,
                        type: status === "critical" ? "warning" : "info",
                        is_read: false,
                        link: reorderUrl,
                    });
                    recentNotifKeys.add(notifKey);
                }

                // Send email to client
                if (resendKey && contactEmail && reorderUrl) {
                    try {
                        const emailHtml = buildEmailHtml(peptideName, daysRemaining, reorderUrl, brandName);
                        const res = await fetch(RESEND_URL, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${resendKey}`,
                            },
                            body: JSON.stringify({
                                from: `${brandName} <${senderEmail}>`,
                                to: [contactEmail],
                                reply_to: senderEmail,
                                subject: daysRemaining <= 0
                                    ? `Your ${peptideName} supply is depleted — reorder now`
                                    : `${daysRemaining} days of ${peptideName} left — time to reorder`,
                                html: emailHtml,
                            }),
                        });
                        if (res.ok) {
                            emailsSent.push(contactEmail);
                        } else {
                            console.error(`[check-low-supply] Email to ${contactEmail} failed:`, res.status, await res.text());
                        }
                    } catch (emailErr) {
                        console.error(`[check-low-supply] Email error for ${contactEmail}:`, emailErr);
                    }
                }
            }

            // Notify the assigned rep (if any)
            const repId = first.contacts?.assigned_rep_id;
            if (repId) {
                const { data: repProfile } = await supabase
                    .from("profiles")
                    .select("user_id")
                    .eq("id", repId)
                    .single();

                if (repProfile?.user_id) {
                    const repTitle = `${contactName}'s ${peptideName} supply running ${status}`;
                    const repNotifKey = `${repProfile.user_id}::${repTitle}`;

                    if (!recentNotifKeys.has(repNotifKey)) {
                        notificationsToInsert.push({
                            user_id: repProfile.user_id,
                            title: repTitle,
                            message: `${contactName} has ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} of ${peptideName} left. Consider reaching out about a refill.`,
                            type: "info",
                            is_read: false,
                            link: null,
                        });
                        recentNotifKeys.add(repNotifKey);
                    }
                }
            }
        }

        // Batch insert notifications
        if (notificationsToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from("notifications")
                .insert(notificationsToInsert);

            if (insertError) {
                console.error("[check-low-supply] Notification insert error:", insertError.message);
            }
        }

        console.log(
            `[check-low-supply] Scanned ${items.length} items, ${groups.size} peptide-groups, ${alerts.length} low-supply alerts, ${notificationsToInsert.length} notifications created, ${emailsSent.length} emails sent`
        );

        return jsonResponse(
            {
                message: `Checked ${groups.size} peptide-groups across ${items.length} inventory items`,
                alerts_count: alerts.length,
                notifications_created: notificationsToInsert.length,
                emails_sent: emailsSent.length,
                alerts,
            },
            200,
            corsHeaders
        );
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[check-low-supply]", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
}));
