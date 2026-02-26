import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * deploy-webhook — Captures Vercel deployment events for error-deploy correlation.
 *
 * Vercel sends POST with deployment payload. We store it in deploy_events table
 * so the sentinel-worker can correlate error spikes with recent deploys.
 *
 * Auth: DEPLOY_WEBHOOK_SECRET header check (shared secret with Vercel webhook config).
 * Fallback: accepts if DEPLOY_WEBHOOK_SECRET env is not set (for initial setup).
 *
 * Setup in Vercel:
 *   Project Settings → Git → Deploy Hooks (or Webhooks integration)
 *   URL: https://<supabase-url>/functions/v1/deploy-webhook
 *   Secret: <DEPLOY_WEBHOOK_SECRET>
 */

Deno.serve(withErrorReporting("deploy-webhook", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // Auth: verify webhook secret if configured
  const webhookSecret = Deno.env.get("DEPLOY_WEBHOOK_SECRET");
  if (webhookSecret) {
    // Vercel sends secret in x-vercel-signature or Authorization header
    const signature = req.headers.get("x-vercel-signature") ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (signature !== webhookSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }
  }

  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(sbUrl, sbKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  // Vercel webhook payload structure
  // See: https://vercel.com/docs/webhooks
  const payload = body.payload || body;
  const type = body.type || "deployment";

  // Extract deployment info
  const deploymentId = payload.deployment?.id || payload.id || payload.deploymentId || null;
  const commitSha = payload.deployment?.meta?.githubCommitSha ||
    payload.meta?.githubCommitSha ||
    payload.gitSource?.sha ||
    null;
  const commitMessage = payload.deployment?.meta?.githubCommitMessage ||
    payload.meta?.githubCommitMessage ||
    null;
  const branch = payload.deployment?.meta?.githubCommitRef ||
    payload.meta?.githubCommitRef ||
    payload.gitSource?.ref ||
    null;
  const status = mapVercelStatus(payload.deployment?.readyState || payload.readyState || type);
  const url = payload.deployment?.url || payload.url || null;

  const { error: insertError } = await supabase.from("deploy_events").insert({
    deployment_id: deploymentId,
    commit_sha: commitSha,
    commit_message: commitMessage,
    branch,
    status,
    source: "vercel",
    url: url ? `https://${url}` : null,
    deployed_at: payload.createdAt ? new Date(payload.createdAt).toISOString() : new Date().toISOString(),
    metadata: {
      type,
      project: payload.deployment?.name || payload.name || null,
      target: payload.deployment?.target || payload.target || null,
      raw_status: payload.deployment?.readyState || payload.readyState || null,
    },
  });

  if (insertError) {
    console.error("[deploy-webhook] Insert error:", insertError.message);
    return jsonResponse({ error: "Failed to store deploy event" }, 500, corsHeaders);
  }

  return jsonResponse({ ok: true, deployment_id: deploymentId, status }, 200, corsHeaders);
}));

function mapVercelStatus(readyState: string): string {
  switch (readyState?.toUpperCase()) {
    case "BUILDING":
    case "INITIALIZING":
    case "QUEUED":
      return "building";
    case "READY":
    case "deployment.ready":
      return "ready";
    case "ERROR":
    case "deployment.error":
      return "error";
    case "CANCELED":
    case "deployment.canceled":
      return "canceled";
    default:
      return "unknown";
  }
}
