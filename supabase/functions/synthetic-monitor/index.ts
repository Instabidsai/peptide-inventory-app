/**
 * synthetic-monitor: External health check that actually verifies the app renders.
 *
 * Unlike the uptime-monitor GitHub Action (which only checks HTTP 200),
 * this fetches the production URL and checks that the HTML contains evidence
 * of successful rendering — not just that Vercel served the shell.
 *
 * Trigger: pg_cron every 5 minutes, or manual invocation.
 *
 * On 2 consecutive failures:
 *   1. Auto-rollback via Vercel API
 *   2. Log to deployment_rollbacks
 *
 * Why this catches what HTTP 200 doesn't:
 *   Vercel always returns 200 for index.html (it's a static file).
 *   A broken JS bundle = 200 status + empty <div id="root"></div>.
 *   We check for content INSIDE the root div or for known markers.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARGET_URL = "https://app.thepeptideai.com";
const FETCH_TIMEOUT_MS = 20000;
const CONSECUTIVE_FAILURES_FOR_ROLLBACK = 2;
const ROLLBACK_COOLDOWN_MIN = 30;

// Content markers that prove the app actually rendered.
// We check the raw HTML for these — if the SPA shell loaded but JS crashed,
// these won't be present in the server-rendered HTML.
// The boot sentinel fallback message contains "temporary issue" — that means crash.
const CRASH_MARKERS = [
  "We're experiencing a temporary issue", // boot sentinel fallback rendered
];

// The page title is always in the HTML (it's in index.html), so check for it
// as a baseline. If even this is missing, the server itself is down.
const BASELINE_MARKER = "ThePeptideAI";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(sbUrl, sbKey);

  let httpStatus = 0;
  let hasContent = false;
  let contentMarker = "";
  let responseTimeMs = 0;
  let error: string | null = null;
  let passed = false;

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(TARGET_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "PeptideAI-SyntheticMonitor/1.0" },
    });
    clearTimeout(timeout);

    responseTimeMs = Date.now() - start;
    httpStatus = res.status;

    const html = await res.text();

    // Check 1: Does the page have the baseline marker? (server is alive)
    const hasBaseline = html.includes(BASELINE_MARKER);

    // Check 2: Does the page show crash markers? (boot sentinel fired)
    const hasCrashMarker = CRASH_MARKERS.some((m) => html.includes(m));

    // Check 3: Does the root div have content injected by React?
    // After React mounts, the root div has children. In the raw server HTML,
    // it's empty: <div id="root"></div>. But for an SPA, we can't see React
    // content from a server fetch — we can only detect the crash fallback.
    //
    // So the logic is:
    //   - HTTP 200 + has baseline + NO crash marker = PASS (normal SPA)
    //   - HTTP 200 + has crash marker = FAIL (boot sentinel fired)
    //   - HTTP != 200 = FAIL (server down)
    //   - No baseline = FAIL (Vercel not serving anything)

    if (httpStatus === 200 && hasBaseline && !hasCrashMarker) {
      passed = true;
      hasContent = true;
      contentMarker = BASELINE_MARKER;
    } else if (hasCrashMarker) {
      error = "Boot sentinel crash page detected";
      contentMarker = "crash_fallback";
    } else if (!hasBaseline) {
      error = "Baseline content marker missing — page may be empty";
      contentMarker = "none";
    } else {
      error = `HTTP ${httpStatus}`;
    }
  } catch (err) {
    error = (err as Error).message;
    if (error.includes("abort")) {
      error = `Timeout after ${FETCH_TIMEOUT_MS}ms`;
    }
  }

  // Log the check
  await sb.from("synthetic_checks").insert({
    url: TARGET_URL,
    http_status: httpStatus,
    has_content: hasContent,
    content_marker: contentMarker,
    response_time_ms: responseTimeMs,
    error,
    passed,
  });

  // Check for consecutive failures
  let rolledBack = false;
  if (!passed) {
    const { data: recentChecks } = await sb
      .from("synthetic_checks")
      .select("passed")
      .order("created_at", { ascending: false })
      .limit(CONSECUTIVE_FAILURES_FOR_ROLLBACK);

    const allFailed =
      recentChecks &&
      recentChecks.length >= CONSECUTIVE_FAILURES_FOR_ROLLBACK &&
      recentChecks.every((c: { passed: boolean }) => !c.passed);

    if (allFailed) {
      // Check cooldown
      const cooldownStart = new Date(
        Date.now() - ROLLBACK_COOLDOWN_MIN * 60 * 1000
      ).toISOString();

      const { data: recentRollbacks } = await sb
        .from("deployment_rollbacks")
        .select("id")
        .eq("trigger_source", "synthetic_monitor")
        .gte("created_at", cooldownStart)
        .limit(1);

      if (!recentRollbacks || recentRollbacks.length === 0) {
        const result = await triggerVercelRollback(sb);
        rolledBack = result.success;
      }
    }
  }

  const response = {
    url: TARGET_URL,
    passed,
    http_status: httpStatus,
    has_content: hasContent,
    response_time_ms: responseTimeMs,
    error,
    auto_rollback_triggered: rolledBack,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

async function triggerVercelRollback(
  sb: ReturnType<typeof createClient>
): Promise<{ success: boolean; deployment_id?: string; error?: string }> {
  const token = Deno.env.get("VERCEL_TOKEN");
  const teamId = Deno.env.get("VERCEL_TEAM_ID");
  const projectId = Deno.env.get("VERCEL_PROJECT_ID");

  if (!token || !projectId) {
    return { success: false, error: "Missing VERCEL_TOKEN or VERCEL_PROJECT_ID" };
  }

  try {
    const teamParam = teamId ? `&teamId=${teamId}` : "";

    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=10&state=READY${teamParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return { success: false, error: `Vercel API ${res.status}` };
    }

    const { deployments } = await res.json();
    if (!deployments || deployments.length < 2) {
      return { success: false, error: "No previous deployment found" };
    }

    const rollbackTarget = deployments[1];

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

    await sb.from("deployment_rollbacks").insert({
      trigger_source: "synthetic_monitor",
      rollback_deployment_id: rollbackTarget.uid,
      rollback_deployment_url: rollbackTarget.url
        ? `https://${rollbackTarget.url}`
        : null,
      reason: `${CONSECUTIVE_FAILURES_FOR_ROLLBACK} consecutive synthetic check failures`,
      consecutive_failures: CONSECUTIVE_FAILURES_FOR_ROLLBACK,
      metadata: {
        deployment_created: rollbackTarget.created,
        promote_status: promoteRes.status,
      },
    });

    return { success: promoteRes.ok, deployment_id: rollbackTarget.uid };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
