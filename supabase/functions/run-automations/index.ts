import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateCron, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";

/**
 * run-automations — Cron-triggered automation executor.
 * Auth: CRON_SECRET header (not user JWT).
 *
 * SECURITY: The condition_sql field has been removed to prevent SQL injection.
 * The update_field and create_record actions use an allowlist of safe tables.
 */

// Allowlist of tables that automations can write to
const SAFE_TABLES = new Set([
    'notifications',
    'custom_entity_records',
    'contacts',
    'movements',
]);

// Parse cron schedule to check if it should run now
function shouldCronRun(schedule: string, lastRunAt: string | null): boolean {
    if (!lastRunAt) return true;

    const parts = schedule.split(' ');
    if (parts.length !== 5) return false;

    const now = new Date();
    const lastRun = new Date(lastRunAt);
    const [minute, hour, , ,] = parts;

    if (minute.startsWith('*/')) {
        const interval = parseInt(minute.slice(2)) || 15;
        const minsSinceLastRun = (now.getTime() - lastRun.getTime()) / 60000;
        return minsSinceLastRun >= interval;
    }

    if (minute !== '*' && hour === '*') {
        const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
        return hoursSinceLastRun >= 1;
    }

    if (minute !== '*' && hour !== '*') {
        const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
        return hoursSinceLastRun >= 23;
    }

    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
    return hoursSinceLastRun >= 1;
}

interface ActionConfig {
    title?: string;
    body?: string;
    to?: string;
    subject?: string;
    template?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    payload?: Record<string, unknown>;
    table?: string;
    field?: string;
    value?: unknown;
    match?: Record<string, unknown>;
    data?: Record<string, unknown>;
}

interface Automation {
    id: string;
    name: string;
    org_id: string;
    action_type: string;
    action_config: ActionConfig;
    trigger_config: { schedule?: string; table?: string };
    last_run_at: string | null;
    run_count: number;
}

async function executeAction(
    automation: Automation,
    supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
    orgId: string,
): Promise<{ success: boolean; message: string }> {
    const { action_type, action_config } = automation;

    switch (action_type) {
        case "notification": {
            const { error } = await supabase.from("notifications").insert({
                org_id: orgId,
                title: action_config.title || "Automation Alert",
                body: action_config.body || "",
                type: "automation",
                metadata: { automation_id: automation.id, automation_name: automation.name },
            });
            if (error) return { success: false, message: `Notification failed: ${error.message}` };
            return { success: true, message: "Notification sent" };
        }

        case "email": {
            const sbUrl = Deno.env.get("SUPABASE_URL");
            const sbAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
            if (!sbUrl || !sbAnonKey) return { success: false, message: "Missing Supabase config for email" };

            const emailRes = await fetch(`${sbUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sbAnonKey}`,
                },
                body: JSON.stringify({
                    to: action_config.to,
                    subject: action_config.subject || "Automation Alert",
                    html: action_config.template || action_config.body || "",
                    org_id: orgId,
                }),
            });

            if (!emailRes.ok) {
                return { success: false, message: `Email failed: ${emailRes.status}` };
            }
            return { success: true, message: `Email sent to ${action_config.to}` };
        }

        case "webhook": {
            const webhookUrl = action_config.url || '';
            try {
                const parsed = new URL(webhookUrl);
                const hostname = parsed.hostname.toLowerCase();
                if (
                    hostname === 'localhost' ||
                    hostname === '127.0.0.1' ||
                    hostname === '0.0.0.0' ||
                    hostname.startsWith('10.') ||
                    hostname.startsWith('192.168.') ||
                    hostname.startsWith('172.') ||
                    hostname.endsWith('.local') ||
                    hostname.endsWith('.internal') ||
                    parsed.protocol !== 'https:'
                ) {
                    return { success: false, message: `Blocked webhook URL: must be public HTTPS endpoint` };
                }
            } catch {
                return { success: false, message: `Invalid webhook URL: ${webhookUrl}` };
            }

            const webhookRes = await fetch(webhookUrl, {
                method: action_config.method || "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(action_config.headers || {}),
                },
                body: JSON.stringify({
                    automation_id: automation.id,
                    automation_name: automation.name,
                    org_id: orgId,
                    triggered_at: new Date().toISOString(),
                    ...(action_config.payload || {}),
                }),
            });

            if (!webhookRes.ok) {
                return { success: false, message: `Webhook failed: ${webhookRes.status}` };
            }
            return { success: true, message: `Webhook called: ${action_config.url}` };
        }

        case "update_field": {
            if (!action_config.table || !action_config.field || action_config.value === undefined) {
                return { success: false, message: "update_field requires table, field, and value" };
            }
            // Table allowlist — prevent arbitrary table writes
            if (!SAFE_TABLES.has(action_config.table)) {
                return { success: false, message: `Table "${action_config.table}" is not allowed for automations` };
            }

            const { error } = await supabase
                .from(action_config.table)
                .update({ [action_config.field]: action_config.value })
                .eq("org_id", orgId)
                .match(action_config.match || {});

            if (error) return { success: false, message: `Update failed: ${error.message}` };
            return { success: true, message: `Updated ${action_config.table}.${action_config.field}` };
        }

        case "create_record": {
            if (!action_config.table || !action_config.data) {
                return { success: false, message: "create_record requires table and data" };
            }
            // Table allowlist
            if (!SAFE_TABLES.has(action_config.table)) {
                return { success: false, message: `Table "${action_config.table}" is not allowed for automations` };
            }

            const { error } = await supabase
                .from(action_config.table)
                .insert({ org_id: orgId, ...action_config.data });

            if (error) return { success: false, message: `Insert failed: ${error.message}` };
            return { success: true, message: `Record created in ${action_config.table}` };
        }

        default:
            return { success: false, message: `Unknown action type: ${action_type}` };
    }
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: CRON_SECRET only — not user-triggered
        const supabase = authenticateCron(req);

        // Rate limit: 1 req/min (cron only runs periodically)
        const rl = checkRateLimit('cron:run-automations', { maxRequests: 1, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

        // Fetch all active cron automations
        const { data: automations, error } = await supabase
            .from("custom_automations")
            .select("*")
            .eq("active", true)
            .eq("trigger_type", "cron");

        if (error) {
            console.error("[run-automations] Fetch error:", error.message);
            return jsonResponse({ error: error.message }, 500, corsHeaders);
        }

        if (!automations?.length) {
            return jsonResponse({ message: "No active cron automations", executed: 0 }, 200, corsHeaders);
        }

        const results: { id: string; name: string; success: boolean; message: string }[] = [];

        for (const automation of automations as Automation[]) {
            const schedule = automation.trigger_config?.schedule;
            if (!schedule) continue;

            if (!shouldCronRun(schedule, automation.last_run_at)) continue;

            // SECURITY: condition_sql field is intentionally ignored.
            // Raw SQL interpolation is a SQL injection vector.
            // TODO: Replace with safe predicate system (field/operator/value).

            const result = await executeAction(automation, supabase, automation.org_id);
            results.push({
                id: automation.id,
                name: automation.name,
                ...result,
            });

            await supabase
                .from("custom_automations")
                .update({
                    last_run_at: new Date().toISOString(),
                    run_count: (automation.run_count || 0) + 1,
                })
                .eq("id", automation.id);
        }

        console.log(`[run-automations] Executed ${results.length} automations`);

        return jsonResponse({
            message: `Processed ${automations.length} automations, executed ${results.length}`,
            results,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[run-automations]", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
});
