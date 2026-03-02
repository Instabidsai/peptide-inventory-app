/* eslint-disable complexity, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { authenticateCron, authenticateRequest, AuthError, createServiceClient } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { callWithGuard } from "../_shared/service-guard.ts";

/**
 * health-digest — Daily morning email summarizing system health.
 *
 * Triggered by pg_cron at 7:00 AM UTC daily (or manually via POST with admin JWT).
 *
 * Contents:
 *   1. Overall health score (pass/fail ratio over last 24h)
 *   2. Active incidents summary
 *   3. Error trend (new bug reports in last 24h vs previous 24h)
 *   4. Resource metric warnings
 *   5. Sentinel health (runs, fixes, escalations)
 *   6. AI usage snapshot (conversations, messages)
 *   7. Performance baselines vs actuals
 *
 * Sends to HEAL_EMAIL via Resend.
 * Auth: CRON_SECRET header or admin JWT.
 */

const RESEND_URL = "https://api.resend.com/emails";

interface DigestData {
    // Health checks
    totalChecks: number;
    passCount: number;
    failCount: number;
    failedChecks: string[];
    avgLatencyMs: number;
    // Incidents
    activeIncidents: { title: string; severity: string; source: string; detected_at: string }[];
    resolvedLast24h: number;
    autoHealedLast24h: number;
    // Error trends
    bugsLast24h: number;
    bugsPrev24h: number;
    topErrors: { description: string; count: number }[];
    // Resource metrics
    warnings: { metric: string; value: number; threshold: number; status: string }[];
    // Sentinel
    sentinelRuns: number;
    sentinelFixesApplied: number;
    sentinelEscalations: number;
    lastSentinelRun: string | null;
    // AI usage
    aiConversations: number;
    aiMessages: number;
    // Performance
    anomalies: { check: string; actual: number; baseline: number }[];
}

async function gatherDigestData(supabase: ReturnType<typeof createClient>): Promise<DigestData> {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // 1. Health checks (last 24h)
    const { data: healthChecks } = await supabase
        .from("health_checks")
        .select("check_name, status, latency_ms")
        .gte("checked_at", h24);

    const checks = healthChecks || [];
    const totalChecks = checks.length;
    const passCount = checks.filter(c => c.status === "pass").length;
    const failCount = checks.filter(c => c.status === "fail").length;

    // Unique failed check names
    const failedNames = new Set<string>();
    for (const c of checks) {
        if (c.status === "fail") failedNames.add(c.check_name);
    }

    // Average latency (skip 0-latency checks)
    const latencies = checks.filter(c => c.latency_ms > 0).map(c => c.latency_ms);
    const avgLatencyMs = latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    // 2. Active incidents
    const { data: activeIncidentsData } = await supabase
        .from("incidents")
        .select("title, severity, source, detected_at")
        .in("status", ["detected", "diagnosing", "healing", "healed"])
        .order("detected_at", { ascending: false })
        .limit(10);

    // Resolved in last 24h
    const { count: resolvedCount } = await supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", h24);

    // Auto-healed in last 24h
    const { count: autoHealedCount } = await supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("auto_healed", true)
        .gte("resolved_at", h24);

    // 3. Bug reports trends
    const { count: bugsLast24h } = await supabase
        .from("bug_reports")
        .select("*", { count: "exact", head: true })
        .gte("created_at", h24);

    const { count: bugsPrev24h } = await supabase
        .from("bug_reports")
        .select("*", { count: "exact", head: true })
        .gte("created_at", h48)
        .lt("created_at", h24);

    // Top errors by grouping (recent open bugs)
    const { data: recentBugs } = await supabase
        .from("bug_reports")
        .select("description")
        .eq("status", "open")
        .gte("created_at", h24)
        .limit(200);

    const errorCounts = new Map<string, number>();
    for (const bug of (recentBugs || [])) {
        // Fingerprint: strip timestamps, UUIDs, numbers from description
        const fp = bug.description
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID")
            .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g, "TIMESTAMP")
            .slice(0, 120);
        errorCounts.set(fp, (errorCounts.get(fp) || 0) + 1);
    }
    const topErrors = [...errorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([description, count]) => ({ description, count }));

    // 4. Resource metric warnings
    const { data: metricWarnings } = await supabase
        .from("resource_metrics")
        .select("metric_name, metric_value, threshold_warning, status")
        .in("status", ["warning", "critical"])
        .gte("checked_at", h24)
        .order("checked_at", { ascending: false })
        .limit(20);

    // Deduplicate by metric name (keep most recent)
    const seenMetrics = new Set<string>();
    const uniqueWarnings: typeof metricWarnings = [];
    for (const m of (metricWarnings || [])) {
        if (!seenMetrics.has(m.metric_name)) {
            seenMetrics.add(m.metric_name);
            uniqueWarnings.push(m);
        }
    }

    // 5. Sentinel health
    const { data: sentinelRuns } = await supabase
        .from("sentinel_runs")
        .select("started_at, status, stats")
        .gte("started_at", h24)
        .order("started_at", { ascending: false });

    const runs = sentinelRuns || [];
    let totalFixes = 0;
    let totalEscalations = 0;
    for (const run of runs) {
        const s = run.stats as any;
        if (s) {
            totalFixes += (s.fixes_applied || 0) + (s.schema_fixes_applied || 0);
            totalEscalations += s.escalations_sent || 0;
        }
    }

    // 6. AI usage (last 24h)
    const { count: aiConversations } = await supabase
        .from("ai_conversations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", h24);

    const { count: aiMessages } = await supabase
        .from("ai_messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", h24);

    // 7. Performance anomalies
    const { data: baselines } = await supabase
        .from("performance_baselines")
        .select("check_name, avg_latency_ms, p95_latency_ms")
        .eq("window_hours", 24);

    const anomalies: { check: string; actual: number; baseline: number }[] = [];
    if (baselines) {
        // Get latest check result for each baseline
        for (const b of baselines) {
            const latestCheck = checks
                .filter(c => c.check_name === b.check_name && c.latency_ms > 0)
                .sort((x, y) => y.latency_ms - x.latency_ms)[0];
            if (latestCheck && b.avg_latency_ms > 0) {
                const ratio = latestCheck.latency_ms / Number(b.avg_latency_ms);
                if (ratio > 2.5) {
                    anomalies.push({
                        check: b.check_name,
                        actual: latestCheck.latency_ms,
                        baseline: Math.round(Number(b.avg_latency_ms)),
                    });
                }
            }
        }
    }

    return {
        totalChecks,
        passCount,
        failCount,
        failedChecks: [...failedNames],
        avgLatencyMs,
        activeIncidents: activeIncidentsData || [],
        resolvedLast24h: resolvedCount || 0,
        autoHealedLast24h: autoHealedCount || 0,
        bugsLast24h: bugsLast24h || 0,
        bugsPrev24h: bugsPrev24h || 0,
        topErrors,
        warnings: uniqueWarnings.map(m => ({
            metric: m.metric_name,
            value: Number(m.metric_value),
            threshold: Number(m.threshold_warning),
            status: m.status,
        })),
        sentinelRuns: runs.length,
        sentinelFixesApplied: totalFixes,
        sentinelEscalations: totalEscalations,
        lastSentinelRun: runs[0]?.started_at || null,
        aiConversations: aiConversations || 0,
        aiMessages: aiMessages || 0,
        anomalies,
    };
}

// ═══════════════════════════════════════════════════════════════
// Email HTML builder
// ═══════════════════════════════════════════════════════════════

function healthScore(data: DigestData): { score: number; emoji: string; color: string; label: string } {
    if (data.totalChecks === 0) return { score: 0, emoji: "⚪", color: "#9ca3af", label: "No Data" };
    const pct = Math.round((data.passCount / data.totalChecks) * 100);
    if (pct >= 99) return { score: pct, emoji: "🟢", color: "#16a34a", label: "Excellent" };
    if (pct >= 95) return { score: pct, emoji: "🟡", color: "#ca8a04", label: "Good" };
    if (pct >= 90) return { score: pct, emoji: "🟠", color: "#ea580c", label: "Degraded" };
    return { score: pct, emoji: "🔴", color: "#dc2626", label: "Critical" };
}

function trendArrow(current: number, previous: number): string {
    if (current > previous) return `↑${current - previous}`;
    if (current < previous) return `↓${previous - current}`;
    return "→ same";
}

function buildDigestHtml(data: DigestData, dateStr: string): string {
    const health = healthScore(data);

    // Section: Active incidents
    let incidentRows = "";
    if (data.activeIncidents.length === 0) {
        incidentRows = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #6b7280;">No active incidents 🎉</td></tr>`;
    } else {
        for (const inc of data.activeIncidents) {
            const sevColor = inc.severity === "critical" ? "#dc2626" : inc.severity === "high" ? "#f59e0b" : "#3b82f6";
            const ago = timeSince(new Date(inc.detected_at));
            incidentRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 8px;"><span style="background: ${sevColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${inc.severity.toUpperCase()}</span></td>
                    <td style="padding: 8px; font-size: 13px;">${esc(inc.title.slice(0, 60))}</td>
                    <td style="padding: 8px; font-size: 12px; color: #6b7280;">${inc.source}</td>
                    <td style="padding: 8px; font-size: 12px; color: #6b7280;">${ago}</td>
                </tr>`;
        }
    }

    // Section: Top errors
    let errorRows = "";
    if (data.topErrors.length === 0) {
        errorRows = `<tr><td colspan="2" style="padding: 12px; text-align: center; color: #6b7280;">No new errors</td></tr>`;
    } else {
        for (const e of data.topErrors) {
            errorRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 8px; font-size: 12px; font-family: monospace; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">${esc(e.description.slice(0, 100))}</td>
                    <td style="padding: 8px; font-size: 13px; font-weight: 600; text-align: center;">${e.count}×</td>
                </tr>`;
        }
    }

    // Section: Resource warnings
    let warningRows = "";
    if (data.warnings.length === 0) {
        warningRows = `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #6b7280;">All resources healthy</td></tr>`;
    } else {
        for (const w of data.warnings) {
            const wColor = w.status === "critical" ? "#dc2626" : "#f59e0b";
            warningRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 8px; font-size: 13px;">${esc(w.metric)}</td>
                    <td style="padding: 8px; font-size: 13px; font-weight: 600; color: ${wColor};">${w.value.toLocaleString()}</td>
                    <td style="padding: 8px; font-size: 12px; color: #6b7280;">threshold: ${w.threshold.toLocaleString()}</td>
                </tr>`;
        }
    }

    // Section: Performance anomalies
    let anomalyRows = "";
    if (data.anomalies.length > 0) {
        for (const a of data.anomalies) {
            const ratio = (a.actual / a.baseline).toFixed(1);
            anomalyRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 8px; font-size: 13px;">${esc(a.check)}</td>
                    <td style="padding: 8px; font-size: 13px; color: #dc2626; font-weight: 600;">${a.actual}ms</td>
                    <td style="padding: 8px; font-size: 12px; color: #6b7280;">${a.baseline}ms (${ratio}× baseline)</td>
                </tr>`;
        }
    }

    const bugTrend = trendArrow(data.bugsLast24h, data.bugsPrev24h);
    const bugTrendColor = data.bugsLast24h > data.bugsPrev24h ? "#dc2626" : data.bugsLast24h < data.bugsPrev24h ? "#16a34a" : "#6b7280";

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; background: #f9fafb; color: #1a1a2e;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
    <h1 style="margin: 0; color: white; font-size: 22px;">Daily Health Digest</h1>
    <p style="margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">${dateStr}</p>
  </div>

  <!-- Health Score Card -->
  <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <h2 style="margin: 0; font-size: 16px; color: #374151;">Overall Health</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${data.totalChecks} checks · ${data.passCount} pass · ${data.failCount} fail</p>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 36px; font-weight: 700; color: ${health.color};">${health.score}%</div>
        <div style="font-size: 12px; color: ${health.color}; font-weight: 600;">${health.label}</div>
      </div>
    </div>
    ${data.failedChecks.length > 0 ? `<div style="margin-top: 12px; padding: 8px 12px; background: #fef2f2; border-radius: 6px; font-size: 12px; color: #991b1b;">
      Failed: ${data.failedChecks.slice(0, 8).map(esc).join(", ")}${data.failedChecks.length > 8 ? ` +${data.failedChecks.length - 8} more` : ""}
    </div>` : ""}
  </div>

  <!-- Stats Grid -->
  <div style="display: flex; gap: 12px; margin-bottom: 16px;">
    <div style="flex: 1; background: white; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${data.activeIncidents.length}</div>
      <div style="font-size: 12px; color: #6b7280;">Active Incidents</div>
    </div>
    <div style="flex: 1; background: white; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size: 24px; font-weight: 700; color: ${bugTrendColor};">${data.bugsLast24h}</div>
      <div style="font-size: 12px; color: #6b7280;">Bugs (${bugTrend})</div>
    </div>
    <div style="flex: 1; background: white; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${data.autoHealedLast24h}</div>
      <div style="font-size: 12px; color: #6b7280;">Auto-Healed</div>
    </div>
    <div style="flex: 1; background: white; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.avgLatencyMs}</div>
      <div style="font-size: 12px; color: #6b7280;">Avg Latency (ms)</div>
    </div>
  </div>

  <!-- Active Incidents -->
  <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Active Incidents</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Sev</th>
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Title</th>
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Source</th>
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Age</th>
        </tr>
      </thead>
      <tbody>${incidentRows}</tbody>
    </table>
    <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">${data.resolvedLast24h} resolved · ${data.autoHealedLast24h} auto-healed in last 24h</p>
  </div>

  <!-- Top Errors -->
  ${data.topErrors.length > 0 ? `
  <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Top Error Patterns (24h)</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tbody>${errorRows}</tbody>
    </table>
  </div>` : ""}

  <!-- Resource Warnings -->
  ${data.warnings.length > 0 ? `
  <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Resource Warnings</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tbody>${warningRows}</tbody>
    </table>
  </div>` : ""}

  <!-- Performance Anomalies -->
  ${data.anomalies.length > 0 ? `
  <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Performance Anomalies</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af;">Check</th>
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af;">Actual</th>
          <th style="padding: 8px; text-align: left; font-size: 11px; color: #9ca3af;">Baseline</th>
        </tr>
      </thead>
      <tbody>${anomalyRows}</tbody>
    </table>
  </div>` : ""}

  <!-- Sentinel + AI Summary -->
  <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h3 style="margin: 0 0 12px; font-size: 15px; color: #374151;">System Activity (24h)</h3>
    <table style="width: 100%; font-size: 13px;">
      <tr>
        <td style="padding: 6px 8px; color: #6b7280;">Sentinel runs</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.sentinelRuns}</td>
        <td style="padding: 6px 8px; color: #6b7280;">Fixes applied</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.sentinelFixesApplied}</td>
      </tr>
      <tr>
        <td style="padding: 6px 8px; color: #6b7280;">Escalations sent</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.sentinelEscalations}</td>
        <td style="padding: 6px 8px; color: #6b7280;">Last run</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.lastSentinelRun ? timeSince(new Date(data.lastSentinelRun)) + " ago" : "Never"}</td>
      </tr>
      <tr>
        <td style="padding: 6px 8px; color: #6b7280;">AI conversations</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.aiConversations}</td>
        <td style="padding: 6px 8px; color: #6b7280;">AI messages</td>
        <td style="padding: 6px 8px; font-weight: 600;">${data.aiMessages}</td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 11px;">
    <p style="margin: 0;">ThePeptideAI Health Digest · Generated at ${new Date().toISOString().slice(0, 19)}Z</p>
    <p style="margin: 4px 0 0;">Powered by sentinel-worker + health-probe</p>
  </div>

</body>
</html>`.trim();
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeSince(date: Date): string {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const d = Math.floor(hr / 24);
    return `${d}d`;
}

/** Resolve Resend API key: env var -> platform_config table */
async function getResendKey(supabase: ReturnType<typeof createClient>): Promise<string> {
    const envKey = Deno.env.get("RESEND_API_KEY");
    if (envKey) return envKey;
    try {
        const { data } = await supabase
            .from("platform_config")
            .select("value")
            .eq("key", "RESEND_API_KEY")
            .single();
        return data?.value || "";
    } catch {
        return "";
    }
}

// ═══════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════

Deno.serve(withErrorReporting("health-digest", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        // Auth: CRON_SECRET or admin JWT
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = authenticateCron(req);
        } catch {
            const auth = await authenticateRequest(req, { requireRole: ["admin", "super_admin"] });
            supabase = createServiceClient();
        }

        // Gather all data
        const data = await gatherDigestData(supabase);

        // Build email
        const dateStr = new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const health = healthScore(data);

        const subject = `${health.emoji} Health Digest: ${health.score}% — ${data.activeIncidents.length} incidents, ${data.bugsLast24h} bugs (${dateStr})`;
        const html = buildDigestHtml(data, dateStr);

        // Resolve email recipient and Resend key
        const healEmail = Deno.env.get("HEAL_EMAIL");
        const resendKey = await getResendKey(supabase);

        if (!resendKey || !healEmail) {
            console.log(`[health-digest] Missing RESEND_API_KEY or HEAL_EMAIL — skipping send`);
            return jsonResponse({
                sent: false,
                reason: !resendKey ? "No RESEND_API_KEY" : "No HEAL_EMAIL",
                digest: data,
            }, 200, corsHeaders);
        }

        // Send via Resend (with circuit breaker)
        const result = await callWithGuard("resend", async () => {
            const res = await fetch(RESEND_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                    from: "Health Digest <sentinel@thepeptideai.com>",
                    to: [healEmail],
                    subject,
                    html,
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Resend ${res.status}: ${errText.slice(0, 200)}`);
            }
            return res.json();
        }, 15_000);

        // Log to escalation_log for tracking
        await supabase.from("escalation_log").insert({
            channel: "email",
            recipient: healEmail,
            subject,
            status: "sent",
        }).then(() => {}, () => {});

        console.log(`[health-digest] Sent digest to ${healEmail}: ${health.score}% health, ${data.activeIncidents.length} incidents, ${data.bugsLast24h} bugs`);

        return jsonResponse({
            sent: true,
            email_id: result.id,
            health_score: health.score,
            active_incidents: data.activeIncidents.length,
            bugs_24h: data.bugsLast24h,
            auto_healed_24h: data.autoHealedLast24h,
        }, 200, corsHeaders);

    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[health-digest]", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
}));
