import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { authenticateCron, authenticateRequest, AuthError, createServiceClient } from "../_shared/auth.ts";

/**
 * health-probe — Autonomous health check that runs every 5 minutes via pg_cron.
 *
 * Checks: DB connectivity, Auth service, critical RPCs, critical edge functions, app URL.
 * Writes all results to health_checks table.
 * Creates incidents for failures. Auto-resolves stale incidents when all checks pass.
 *
 * Auth: CRON_SECRET (for pg_cron/pg_net) or admin JWT (for manual trigger from admin panel).
 * config.toml: verify_jwt = false (cron calls don't have JWT).
 */

const CRITICAL_RPCS = [
  "get_peptide_stock_counts",
  "get_inventory_valuation",
  "get_bottle_stats",
  "get_org_counts",
  "delete_contact_cascade",
  "process_sale_commission",
];

const CRITICAL_EDGE_FUNCTIONS = [
  "chat-with-ai",
  "send-email",
  "self-signup",
  "provision-tenant",
  "check-payment-emails",
];

interface CheckResult {
  check_name: string;
  category: string;
  status: "pass" | "fail";
  latency_ms: number;
  error_message: string | null;
}

Deno.serve(withErrorReporting("health-probe", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // Auth: try CRON_SECRET first, fall back to admin JWT (for "Run Probe" button)
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = authenticateCron(req);
  } catch {
    try {
      const auth = await authenticateRequest(req, { requireRole: ["admin", "super_admin"], requireOrg: false });
      supabase = createServiceClient(); // Use service client for writes (admin JWT is read-only via RLS)
    } catch (err) {
      if (err instanceof AuthError) {
        return jsonResponse({ error: err.message }, err.status, corsHeaders);
      }
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }
  }
  const results: CheckResult[] = [];
  const failures: string[] = [];

  // 1. Database connectivity
  {
    const start = Date.now();
    try {
      const { error } = await supabase.from("organizations").select("id").limit(1);
      const latency = Date.now() - start;
      if (error) {
        results.push({ check_name: "database", category: "infra", status: "fail", latency_ms: latency, error_message: error.message });
        failures.push(`Database: ${error.message}`);
      } else {
        results.push({ check_name: "database", category: "infra", status: "pass", latency_ms: latency, error_message: null });
      }
    } catch (err) {
      results.push({ check_name: "database", category: "infra", status: "fail", latency_ms: Date.now() - start, error_message: (err as Error).message });
      failures.push(`Database: ${(err as Error).message}`);
    }
  }

  // 2. Auth service
  {
    const start = Date.now();
    try {
      const { error } = await supabase.auth.getSession();
      const latency = Date.now() - start;
      if (error) {
        results.push({ check_name: "auth_service", category: "infra", status: "fail", latency_ms: latency, error_message: error.message });
        failures.push(`Auth: ${error.message}`);
      } else {
        results.push({ check_name: "auth_service", category: "infra", status: "pass", latency_ms: latency, error_message: null });
      }
    } catch (err) {
      results.push({ check_name: "auth_service", category: "infra", status: "fail", latency_ms: Date.now() - start, error_message: (err as Error).message });
      failures.push(`Auth: ${(err as Error).message}`);
    }
  }

  // 3. Critical RPCs — batch check via run_readonly_query (avoids param-signature mismatch)
  {
    const start = Date.now();
    try {
      const rpcList = CRITICAL_RPCS.map((r) => `'${r}'`).join(",");
      const { data, error } = await supabase.rpc("check_functions_exist", {
        function_names: CRITICAL_RPCS,  // Uses dedicated helper (no org_id needed)
      });
      const latency = Date.now() - start;
      if (error) {
        // Fallback: mark all as unknown
        for (const rpc of CRITICAL_RPCS) {
          results.push({ check_name: `rpc:${rpc}`, category: "rpc", status: "fail", latency_ms: latency, error_message: `Check failed: ${error.message}` });
        }
        failures.push(`RPC batch check: ${error.message}`);
      } else {
        const foundNames = new Set(
          (Array.isArray(data) ? data : []).map((r: any) => r.routine_name),
        );
        for (const rpc of CRITICAL_RPCS) {
          if (foundNames.has(rpc)) {
            results.push({ check_name: `rpc:${rpc}`, category: "rpc", status: "pass", latency_ms: latency, error_message: null });
          } else {
            results.push({ check_name: `rpc:${rpc}`, category: "rpc", status: "fail", latency_ms: latency, error_message: "Function not found" });
            failures.push(`RPC ${rpc}: not found`);
          }
        }
      }
    } catch (err) {
      const latency = Date.now() - start;
      for (const rpc of CRITICAL_RPCS) {
        results.push({ check_name: `rpc:${rpc}`, category: "rpc", status: "fail", latency_ms: latency, error_message: (err as Error).message });
      }
      failures.push(`RPC batch check: ${(err as Error).message}`);
    }
  }

  // 4. Critical edge functions (OPTIONS ping)
  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const fn of CRITICAL_EDGE_FUNCTIONS) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${sbUrl}/functions/v1/${fn}`, {
        method: "OPTIONS",
        signal: controller.signal,
        headers: { apikey: sbKey },
      });
      clearTimeout(timeout);
      const latency = Date.now() - start;
      if (res.status >= 500) {
        results.push({ check_name: `edge:${fn}`, category: "edge", status: "fail", latency_ms: latency, error_message: `HTTP ${res.status}` });
        failures.push(`Edge ${fn}: HTTP ${res.status}`);
      } else {
        results.push({ check_name: `edge:${fn}`, category: "edge", status: "pass", latency_ms: latency, error_message: null });
      }
    } catch (err) {
      results.push({ check_name: `edge:${fn}`, category: "edge", status: "fail", latency_ms: Date.now() - start, error_message: (err as Error).message });
      failures.push(`Edge ${fn}: ${(err as Error).message}`);
    }
  }

  // 5. App URL
  {
    const appUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://app.thepeptideai.com";
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(appUrl, { method: "HEAD", signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      const latency = Date.now() - start;
      if (!res.ok) {
        results.push({ check_name: "app_url", category: "app", status: "fail", latency_ms: latency, error_message: `HTTP ${res.status}` });
        failures.push(`App: HTTP ${res.status}`);
      } else {
        results.push({ check_name: "app_url", category: "app", status: "pass", latency_ms: latency, error_message: null });
      }
    } catch (err) {
      results.push({ check_name: "app_url", category: "app", status: "fail", latency_ms: Date.now() - start, error_message: (err as Error).message });
      failures.push(`App: ${(err as Error).message}`);
    }
  }

  // ── Write results to health_checks table ──
  const now = new Date().toISOString();
  const rows = results.map((r) => ({ ...r, checked_at: now }));
  const { error: insertError } = await supabase.from("health_checks").insert(rows);
  if (insertError) {
    console.error("[health-probe] Failed to write health_checks:", insertError.message);
  }

  // ── Create incident for failures ──
  if (failures.length > 0) {
    const severity = failures.some((f) => f.startsWith("Database") || f.startsWith("App"))
      ? "critical"
      : "high";
    await supabase.from("incidents").insert({
      title: `Health probe: ${failures.length} failure(s)`,
      severity,
      status: "detected",
      source: "health_probe",
      error_pattern: failures.join("; "),
      metadata: {
        failures,
        total_checks: results.length,
        pass_count: results.filter((r) => r.status === "pass").length,
      },
    });
  }

  // ── Auto-resolve stale health_probe incidents when everything is green ──
  if (failures.length === 0) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
      .from("incidents")
      .update({ status: "resolved", resolved_at: now, auto_healed: true })
      .eq("status", "detected")
      .eq("source", "health_probe")
      .lt("detected_at", oneHourAgo);
  }

  // ── Cleanup: keep only 7 days of health_checks ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("health_checks").delete().lt("checked_at", sevenDaysAgo);

  return jsonResponse(
    {
      ok: failures.length === 0,
      checks: results.length,
      pass: results.filter((r) => r.status === "pass").length,
      fail: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      checked_at: now,
    },
    200,
    corsHeaders,
  );
}));
