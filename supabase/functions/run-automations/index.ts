import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

// Parse cron schedule to check if it should run now
function shouldCronRun(schedule: string, lastRunAt: string | null): boolean {
    if (!lastRunAt) return true; // Never ran before

    const parts = schedule.split(' ');
    if (parts.length !== 5) return false;

    const now = new Date();
    const lastRun = new Date(lastRunAt);
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Simple check: has enough time passed since last run?
    // For "every 15 min" (*/15 * * * *), check 15 min gap
    if (minute.startsWith('*/')) {
        const interval = parseInt(minute.slice(2)) || 15;
        const minsSinceLastRun = (now.getTime() - lastRun.getTime()) / 60000;
        return minsSinceLastRun >= interval;
    }

    // For hourly (0 * * * *), check 1 hour gap
    if (minute !== '*' && hour === '*') {
        const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
        return hoursSinceLastRun >= 1;
    }

    // For daily (0 8 * * *), check 24 hour gap
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*') {
        const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
        return hoursSinceLastRun >= 23;
    }

    // Default: run if more than 1 hour since last run
    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / 3600000;
    return hoursSinceLastRun >= 1;
}

async function executeAction(
    automation: any,
    supabase: any,
    orgId: string
): Promise<{ success: boolean; message: string }> {
    const { action_type, action_config } = automation;

    switch (action_type) {
        case "notification": {
            // Insert into notifications table
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
            // Call the platform email edge function
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
            const webhookRes = await fetch(action_config.url, {
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
            // Update a field on matching records
            if (!action_config.table || !action_config.field || action_config.value === undefined) {
                return { success: false, message: "update_field requires table, field, and value" };
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
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Fetch all active cron automations across all tenants
        const { data: automations, error } = await supabase
            .from("custom_automations")
            .select("*")
            .eq("active", true)
            .eq("trigger_type", "cron");

        if (error) {
            console.error("[run-automations] Fetch error:", error.message);
            return json({ error: error.message }, 500);
        }

        if (!automations?.length) {
            return json({ message: "No active cron automations", executed: 0 });
        }

        const results: { id: string; name: string; success: boolean; message: string }[] = [];

        for (const automation of automations) {
            const schedule = automation.trigger_config?.schedule;
            if (!schedule) continue;

            if (!shouldCronRun(schedule, automation.last_run_at)) continue;

            // Check condition if present
            if (automation.condition_sql) {
                // For safety, only allow simple conditions
                const conditionQuery = `SELECT EXISTS(SELECT 1 FROM ${automation.trigger_config.table || 'custom_entity_records'} WHERE org_id = '${automation.org_id}' AND ${automation.condition_sql}) as met`;
                // Skip condition evaluation for now — just run the action
                // TODO: implement safe condition evaluation
            }

            const result = await executeAction(automation, supabase, automation.org_id);
            results.push({
                id: automation.id,
                name: automation.name,
                ...result,
            });

            // Update last_run_at and run_count
            await supabase
                .from("custom_automations")
                .update({
                    last_run_at: new Date().toISOString(),
                    run_count: (automation.run_count || 0) + 1,
                })
                .eq("id", automation.id);
        }

        console.log(`[run-automations] Executed ${results.length} automations`);

        return json({
            message: `Processed ${automations.length} automations, executed ${results.length}`,
            results,
        });
    } catch (err) {
        console.error("[run-automations]", err);
        return json({ error: (err as Error).message || "Internal error" }, 500);
    }
});
