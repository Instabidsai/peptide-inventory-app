/**
 * boot-failure: Receives crash reports from the inline boot sentinel in index.html.
 *
 * When the React app fails to mount within 15 seconds (module-scope JS crash,
 * broken bundle, etc.), the boot sentinel POSTs here. We:
 *   1. Log the failure to boot_failures table
 *   2. Check if 3+ unique IPs have reported in the last 10 minutes
 *   3. If yes → trigger auto-rollback via Vercel API
 *
 * This is the only line of defense that works when the ENTIRE JS bundle is dead,
 * because the boot sentinel runs from an inline script, not from the bundle.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLLBACK_THRESHOLD = 3;         // unique IPs needed to trigger rollback
const ROLLBACK_WINDOW_MIN = 10;       // time window for counting failures
const ROLLBACK_COOLDOWN_MIN = 30;     // don't rollback more than once per 30 min

Deno.serve(async (req) => {
  // CORS — boot sentinel uses sendBeacon (no preflight), but handle OPTIONS just in case
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(sbUrl, sbKey);

    // 1. Log the failure
    await sb.from("boot_failures").insert({
      url: body.url || "unknown",
      user_agent: body.user_agent || null,
      errors: body.errors || [],
      client_ip: clientIp,
    });

    // 2. Count unique IPs reporting failures in the last N minutes
    const windowStart = new Date(
      Date.now() - ROLLBACK_WINDOW_MIN * 60 * 1000
    ).toISOString();

    const { data: recentFailures } = await sb
      .from("boot_failures")
      .select("client_ip")
      .gte("created_at", windowStart);

    const uniqueIps = new Set(
      (recentFailures || []).map((r: { client_ip: string }) => r.client_ip)
    );

    // 3. Check rollback cooldown
    const cooldownStart = new Date(
      Date.now() - ROLLBACK_COOLDOWN_MIN * 60 * 1000
    ).toISOString();

    const { data: recentRollbacks } = await sb
      .from("deployment_rollbacks")
      .select("id")
      .eq("trigger_source", "boot_sentinel")
      .gte("created_at", cooldownStart)
      .limit(1);

    const shouldRollback =
      uniqueIps.size >= ROLLBACK_THRESHOLD &&
      (!recentRollbacks || recentRollbacks.length === 0);

    if (shouldRollback) {
      const rollbackResult = await triggerVercelRollback(sb, uniqueIps.size);
      return new Response(
        JSON.stringify({
          received: true,
          action: "rollback_triggered",
          unique_reporters: uniqueIps.size,
          rollback: rollbackResult,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        received: true,
        action: uniqueIps.size < ROLLBACK_THRESHOLD ? "logged" : "cooldown",
        unique_reporters: uniqueIps.size,
        threshold: ROLLBACK_THRESHOLD,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

/**
 * Trigger a Vercel rollback to the last successful deployment.
 * Uses the Vercel API to list recent deployments, find the last READY one
 * that isn't the current (broken) one, and promote it.
 */
async function triggerVercelRollback(
  sb: ReturnType<typeof createClient>,
  failureCount: number
): Promise<{ success: boolean; deployment_id?: string; error?: string }> {
  const token = Deno.env.get("VERCEL_TOKEN");
  const teamId = Deno.env.get("VERCEL_TEAM_ID");
  const projectId = Deno.env.get("VERCEL_PROJECT_ID");

  if (!token || !projectId) {
    return { success: false, error: "Missing VERCEL_TOKEN or VERCEL_PROJECT_ID" };
  }

  try {
    const teamParam = teamId ? `&teamId=${teamId}` : "";

    // Get recent production deployments
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=10&state=READY${teamParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return { success: false, error: `Vercel API ${res.status}: ${await res.text()}` };
    }

    const { deployments } = await res.json();

    // The first deployment is the current (broken) one. Find the second one.
    if (!deployments || deployments.length < 2) {
      return { success: false, error: "No previous deployment to roll back to" };
    }

    const rollbackTarget = deployments[1]; // previous successful deployment

    // Promote the previous deployment to production
    const promoteRes = await fetch(
      `https://api.vercel.com/v13/deployments/${rollbackTarget.uid}/promote${teamParam ? `?${teamParam.substring(1)}` : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const promoted = promoteRes.ok;

    // Log the rollback
    await sb.from("deployment_rollbacks").insert({
      trigger_source: "boot_sentinel",
      rollback_deployment_id: rollbackTarget.uid,
      rollback_deployment_url: rollbackTarget.url
        ? `https://${rollbackTarget.url}`
        : null,
      reason: `${failureCount} unique IPs reported boot failure in ${ROLLBACK_WINDOW_MIN} min`,
      consecutive_failures: failureCount,
      metadata: {
        deployment_created: rollbackTarget.created,
        promote_status: promoteRes.status,
      },
    });

    return {
      success: promoted,
      deployment_id: rollbackTarget.uid,
      error: promoted ? undefined : `Promote returned ${promoteRes.status}`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
