import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { authenticateCron, authenticateRequest, AuthError, createServiceClient } from "../_shared/auth.ts";
import { validateSql, executeMgmtQuery, getTableColumns, getFunctionSource, findColumnInOtherTables, tableExists } from "../_shared/schema-healer.ts";

/**
 * sentinel-worker v4 — The AI Self-Healing Brain (Enhanced)
 *
 * Runs every 2 minutes via pg_cron. Zero human intervention.
 *
 * Pipeline:
 *   1. Collect unprocessed bug_reports
 *   2. Group by error fingerprint
 *   3. Match against known error_patterns (substring, regex, exact)
 *   4. For unknown errors: call OpenAI for diagnosis
 *   5. Apply auto-fix actions (circuit breakers, incidents, feature toggles)
 *   6. Correlate error spikes with recent deploys
 *   7. Auto-rollback if deploy correlation + critical severity (NEW v3)
 *   8. Email escalation for critical incidents that can't be auto-fixed (NEW v3)
 *   9. Performance anomaly detection (NEW v3)
 *  10. Auto-resolve stale incidents when errors stop
 *  11. Log everything to heal_log + sentinel_runs
 *
 * Auth: CRON_SECRET (pg_cron) or admin JWT (manual trigger).
 */

// ── Config ────────────────────────────────────────────────────
const MAX_BUGS_PER_RUN = 100;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_WINDOW_MIN = 15;
const AI_DIAGNOSIS_BATCH = 5;
const DEPLOY_CORRELATION_WINDOW_MIN = 30;
const ESCALATION_COOLDOWN_MIN = 60;  // Don't spam emails — 1 per hour per incident
const ANOMALY_THRESHOLD_MULTIPLIER = 2.5; // Flag if latency > 2.5x baseline
const MAX_SCHEMA_FIXES_PER_RUN = 3;
const SCHEMA_FIX_COOLDOWN_HOURS = 24;
const AI_FIX_MAX_TOKENS = 800;

// ── Feature key → error category mapping for circuit breakers ──
const FEATURE_CIRCUIT_MAP: Record<string, string[]> = {
  ai_assistant: ["edge_function"],
  supplements: ["database"],
  protocols: ["database"],
  client_store: ["validation"],
};

const CATEGORY_TO_FEATURES: Record<string, string[]> = {};
for (const [feature, categories] of Object.entries(FEATURE_CIRCUIT_MAP)) {
  for (const cat of categories) {
    if (!CATEGORY_TO_FEATURES[cat]) CATEGORY_TO_FEATURES[cat] = [];
    CATEGORY_TO_FEATURES[cat].push(feature);
  }
}

interface BugReport {
  id: string;
  description: string;
  console_errors: string | null;
  page_url: string | null;
  org_id: string | null;
  created_at: string;
}

interface ErrorPattern {
  id: string;
  pattern: string;
  match_type: string;
  category: string;
  severity: string;
  auto_fix_action: string | null;
  fix_description: string | null;
  cooldown_minutes: number;
  last_fixed_at: string | null;
  times_matched?: number;
  times_fixed?: number;
}

Deno.serve(withErrorReporting("sentinel-worker", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // Auth: CRON_SECRET first, fallback to admin JWT
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = authenticateCron(req);
  } catch {
    try {
      await authenticateRequest(req, { requireRole: ["admin", "super_admin"], requireOrg: false });
      supabase = createServiceClient();
    } catch (err) {
      if (err instanceof AuthError) {
        return jsonResponse({ error: err.message }, err.status, corsHeaders);
      }
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }
  }

  // ── Create sentinel run record ──
  const runStart = new Date().toISOString();
  const { data: runRecord } = await supabase
    .from("sentinel_runs")
    .insert({ started_at: runStart, status: "running" })
    .select("id")
    .single();
  const runId = runRecord?.id;

  const stats = {
    bugs_processed: 0,
    patterns_matched: 0,
    ai_diagnoses: 0,
    fixes_applied: 0,
    circuit_breakers_tripped: 0,
    escalations_sent: 0,
    rollbacks_attempted: 0,
    anomalies_detected: 0,
    schema_fixes_applied: 0,
  };
  const runErrors: string[] = [];

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Collect unprocessed bug reports
    // ═══════════════════════════════════════════════════════════
    const { data: bugs, error: bugError } = await supabase
      .from("bug_reports")
      .select("id, description, console_errors, page_url, org_id, created_at")
      .is("sentinel_processed_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_BUGS_PER_RUN);

    if (bugError) {
      runErrors.push(`Bug fetch: ${bugError.message}`);
    }

    const bugList: BugReport[] = bugs || [];
    stats.bugs_processed = bugList.length;

    if (bugList.length === 0) {
      await doHousekeeping(supabase);
      await checkPerformanceAnomalies(supabase, stats, runErrors);
      await escalateCriticalIncidents(supabase, stats, runErrors);
      // Phase 13 runs even when no NEW bugs — it processes already-diagnosed bugs needing schema fixes
      await healSchemaErrors(supabase, stats, runErrors);
      await finishRun(supabase, runId, stats, runErrors, "completed");
      return jsonResponse({ ok: true, message: "No unprocessed bugs", ...stats }, 200, corsHeaders);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Load active error patterns
    // ═══════════════════════════════════════════════════════════
    const { data: patterns } = await supabase
      .from("error_patterns")
      .select("*")
      .eq("enabled", true);

    const activePatterns: ErrorPattern[] = patterns || [];

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Match bugs against patterns
    // ═══════════════════════════════════════════════════════════
    const unmatchedBugs: BugReport[] = [];
    const matchedActions: { bug: BugReport; pattern: ErrorPattern }[] = [];

    for (const bug of bugList) {
      const errorText = buildErrorText(bug);
      let matched = false;

      for (const pat of activePatterns) {
        if (matchesPattern(errorText, pat)) {
          matched = true;
          stats.patterns_matched++;

          await supabase
            .from("error_patterns")
            .update({ times_matched: (pat.times_matched || 0) + 1, last_matched_at: new Date().toISOString() })
            .eq("id", pat.id);

          await supabase
            .from("bug_reports")
            .update({
              sentinel_processed_at: new Date().toISOString(),
              sentinel_pattern_id: pat.id,
              sentinel_diagnosis: pat.fix_description,
            })
            .eq("id", bug.id);

          if (pat.auto_fix_action && pat.auto_fix_action !== "log_only") {
            matchedActions.push({ bug, pattern: pat });
          }
          break;
        }
      }

      if (!matched) {
        unmatchedBugs.push(bug);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: AI Diagnosis for unknown errors
    // ═══════════════════════════════════════════════════════════
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const diagnoseBatch = unmatchedBugs.slice(0, AI_DIAGNOSIS_BATCH);

    if (openaiKey && diagnoseBatch.length > 0) {
      for (const bug of diagnoseBatch) {
        try {
          const diagnosis = await aiDiagnose(openaiKey, bug);
          stats.ai_diagnoses++;

          await supabase
            .from("bug_reports")
            .update({
              sentinel_processed_at: new Date().toISOString(),
              sentinel_diagnosis: diagnosis,
            })
            .eq("id", bug.id);
        } catch (err) {
          runErrors.push(`AI diagnosis failed for ${bug.id}: ${(err as Error).message}`);
          await supabase
            .from("bug_reports")
            .update({ sentinel_processed_at: new Date().toISOString(), sentinel_diagnosis: "AI diagnosis failed" })
            .eq("id", bug.id);
        }
      }
    }

    // Mark remaining unmatched bugs as processed
    const remainingIds = unmatchedBugs.slice(AI_DIAGNOSIS_BATCH).map((b) => b.id);
    if (remainingIds.length > 0) {
      await supabase
        .from("bug_reports")
        .update({ sentinel_processed_at: new Date().toISOString(), sentinel_diagnosis: "Unmatched — queued for next AI batch" })
        .in("id", remainingIds);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: Execute auto-fix actions
    // ═══════════════════════════════════════════════════════════
    for (const { bug, pattern } of matchedActions) {
      if (pattern.last_fixed_at) {
        const cooldownEnd = new Date(pattern.last_fixed_at).getTime() + pattern.cooldown_minutes * 60_000;
        if (Date.now() < cooldownEnd) continue;
      }

      try {
        switch (pattern.auto_fix_action) {
          case "create_incident":
            await createAutoIncident(supabase, bug, pattern);
            stats.fixes_applied++;
            break;
          case "circuit_breaker":
            await tripCircuitBreaker(supabase, bug, pattern);
            stats.fixes_applied++;
            stats.circuit_breakers_tripped++;
            break;
          case "disable_feature":
            await disableFeature(supabase, bug, pattern);
            stats.fixes_applied++;
            break;
          case "schema_heal":
            // Handled by Phase 13 — skip in Phase 5
            break;
          default:
            break;
        }

        await supabase
          .from("error_patterns")
          .update({ times_fixed: (pattern.times_fixed || 0) + 1, last_fixed_at: new Date().toISOString() })
          .eq("id", pattern.id);

        await supabase.from("heal_log").insert({
          action: pattern.auto_fix_action,
          result: "success",
          details: `Pattern "${pattern.pattern}" matched bug ${bug.id}. Fix: ${pattern.fix_description}`,
        });
      } catch (err) {
        runErrors.push(`Fix failed for pattern ${pattern.id}: ${(err as Error).message}`);
        await supabase.from("heal_log").insert({
          action: pattern.auto_fix_action || "unknown",
          result: "failure",
          details: `Pattern "${pattern.pattern}" fix failed: ${(err as Error).message}`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 6: Deploy correlation
    // ═══════════════════════════════════════════════════════════
    const deployCorrelation = await correlateWithDeploys(supabase, bugList, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 7: Auto-rollback if deploy correlation + critical (NEW v3)
    // ═══════════════════════════════════════════════════════════
    if (deployCorrelation) {
      await attemptAutoRollback(supabase, deployCorrelation, stats, runErrors);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 8: Email escalation for critical incidents (NEW v3)
    // ═══════════════════════════════════════════════════════════
    await escalateCriticalIncidents(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 8b: Retry failed escalations from previous runs (NEW v4)
    // ═══════════════════════════════════════════════════════════
    await retryFailedEscalations(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 9: Performance anomaly detection (NEW v3)
    // ═══════════════════════════════════════════════════════════
    await checkPerformanceAnomalies(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 10: Circuit breaker check (aggregate error rate)
    // ═══════════════════════════════════════════════════════════
    await checkAggregateCircuitBreakers(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 11: Housekeeping
    // ═══════════════════════════════════════════════════════════
    await doHousekeeping(supabase);

    // ═══════════════════════════════════════════════════════════
    // PHASE 12: Business Logic Auto-Repair
    // Reads health_checks with category='business_logic' + status != 'pass'
    // from the last 10 minutes and attempts automatic fixes.
    // ═══════════════════════════════════════════════════════════
    await repairBusinessLogicViolations(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 13: Autonomous Schema Healer
    // Detects "column X does not exist" / "relation X does not exist" errors
    // diagnosed by AI as auto-fixable, generates safe DDL, executes via
    // Supabase Management API, verifies, and auto-learns patterns.
    // ═══════════════════════════════════════════════════════════
    await healSchemaErrors(supabase, stats, runErrors);

    await finishRun(supabase, runId, stats, runErrors, "completed");

    return jsonResponse(
      { ok: true, ...stats, errors: runErrors.length > 0 ? runErrors : undefined },
      200,
      corsHeaders,
    );
  } catch (err) {
    runErrors.push(`Fatal: ${(err as Error).message}`);
    await finishRun(supabase, runId, stats, runErrors, "failed");
    return jsonResponse({ ok: false, error: (err as Error).message, ...stats }, 500, corsHeaders);
  }
}));

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function buildErrorText(bug: BugReport): string {
  let text = bug.description || "";
  if (bug.console_errors) {
    try {
      const parsed = JSON.parse(bug.console_errors);
      if (Array.isArray(parsed)) {
        text += " " + parsed.map((e: any) => `${e.error || e.message || ""} ${e.stack || ""}`).join(" ");
      } else {
        text += " " + bug.console_errors;
      }
    } catch {
      text += " " + bug.console_errors;
    }
  }
  return text;
}

function matchesPattern(text: string, pattern: ErrorPattern): boolean {
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.pattern.toLowerCase();

  switch (pattern.match_type) {
    case "exact":
      return lowerText === lowerPattern;
    case "regex":
      try {
        return new RegExp(pattern.pattern, "i").test(text);
      } catch {
        return false;
      }
    case "substring":
    default:
      return lowerText.includes(lowerPattern);
  }
}

async function aiDiagnose(apiKey: string, bug: BugReport): Promise<string> {
  const errorText = buildErrorText(bug).slice(0, 2000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `You are a self-healing AI sentinel for a SaaS application (multi-tenant peptide inventory CRM).
Analyze the error and provide:
1. ROOT CAUSE (1 sentence)
2. SEVERITY (critical/high/medium/low)
3. AUTO-FIX POSSIBLE? (yes/no + what)
4. RECOMMENDATION (1-2 sentences)

Be concise. No markdown. No pleasantries.`,
          },
          {
            role: "user",
            content: `Error from page "${bug.page_url || 'unknown'}":\n${errorText}`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "No diagnosis returned";
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════
// Email Escalation (NEW v3)
// ═══════════════════════════════════════════════════════════════
async function escalateCriticalIncidents(
  supabase: ReturnType<typeof createClient>,
  stats: { escalations_sent: number },
  runErrors: string[],
): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const healEmail = Deno.env.get("HEAL_EMAIL");
  if (!resendKey || !healEmail) return; // No email config — skip

  try {
    // Find critical/high incidents that haven't been escalated yet
    const cooldownTime = new Date(Date.now() - ESCALATION_COOLDOWN_MIN * 60_000).toISOString();
    const { data: unescalated } = await supabase
      .from("incidents")
      .select("id, title, severity, source, error_pattern, diagnosis, detected_at, metadata")
      .in("severity", ["critical", "high"])
      .in("status", ["detected", "diagnosing", "healing"])
      .is("escalation_sent_at", null)
      .order("detected_at", { ascending: false })
      .limit(5);

    if (!unescalated || unescalated.length === 0) return;

    // Check global escalation cooldown (don't send more than 3 emails per hour)
    const { count: recentEscalations } = await supabase
      .from("escalation_log")
      .select("*", { count: "exact", head: true })
      .eq("channel", "email")
      .gte("created_at", cooldownTime);

    if ((recentEscalations || 0) >= 3) return; // Already sent 3 in the last hour

    for (const incident of unescalated) {
      const subject = `[SENTINEL ${incident.severity.toUpperCase()}] ${incident.title}`;
      const html = buildEscalationEmail(incident);

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "Sentinel AI <sentinel@thepeptideai.com>",
            to: [healEmail],
            subject,
            html,
          }),
        });

        const emailStatus = res.ok ? "sent" : "failed";
        const errMsg = res.ok ? null : await res.text();

        // Log the escalation
        await supabase.from("escalation_log").insert({
          incident_id: incident.id,
          channel: "email",
          recipient: healEmail,
          subject,
          status: emailStatus,
          error_message: errMsg?.slice(0, 500) || null,
        });

        // Mark incident as escalated
        if (res.ok) {
          await supabase
            .from("incidents")
            .update({ escalation_sent_at: new Date().toISOString() })
            .eq("id", incident.id);
          stats.escalations_sent++;
        }

        await supabase.from("heal_log").insert({
          action: "email_escalation",
          result: emailStatus === "sent" ? "success" : "failure",
          details: `Escalated incident "${incident.title}" to ${healEmail}. Status: ${emailStatus}`,
        });

      } catch (err) {
        runErrors.push(`Email escalation failed for incident ${incident.id}: ${(err as Error).message}`);
        await supabase.from("escalation_log").insert({
          incident_id: incident.id,
          channel: "email",
          recipient: healEmail,
          subject,
          status: "failed",
          error_message: (err as Error).message.slice(0, 500),
        });
      }
    }
  } catch (err) {
    runErrors.push(`Escalation check: ${(err as Error).message}`);
  }
}

function buildEscalationEmail(incident: any): string {
  const meta = incident.metadata || {};
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${incident.severity === 'critical' ? '#dc2626' : '#f59e0b'}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Sentinel Alert: ${incident.severity.toUpperCase()}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <h3 style="margin: 0 0 12px;">${incident.title}</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Source</td><td style="padding: 6px 0;">${incident.source}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Severity</td><td style="padding: 6px 0;"><strong>${incident.severity}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Detected</td><td style="padding: 6px 0;">${new Date(incident.detected_at).toLocaleString()}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Pattern</td><td style="padding: 6px 0;">${incident.error_pattern || 'N/A'}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Diagnosis</td><td style="padding: 6px 0;">${incident.diagnosis || 'Pending AI analysis'}</td></tr>
          ${meta.error_count ? `<tr><td style="padding: 6px 0; color: #6b7280;">Error Count</td><td style="padding: 6px 0;">${meta.error_count}</td></tr>` : ''}
          ${meta.commit_sha ? `<tr><td style="padding: 6px 0; color: #6b7280;">Commit</td><td style="padding: 6px 0;">${meta.commit_sha?.slice(0, 7)} — ${meta.commit_message?.slice(0, 80) || ''}</td></tr>` : ''}
        </table>
        <div style="margin-top: 20px; padding: 12px; background: #f3f4f6; border-radius: 6px; font-size: 13px; color: #6b7280;">
          This is an automated alert from the Sentinel AI self-healing system.<br>
          Dashboard: <a href="https://app.thepeptideai.com/vendor/system-health">System Health</a>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// Retry Failed Escalations (NEW v4 — Alert Redundancy)
// ═══════════════════════════════════════════════════════════════
async function retryFailedEscalations(
  supabase: ReturnType<typeof createClient>,
  stats: { escalations_sent: number },
  runErrors: string[],
): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const healEmail = Deno.env.get("HEAL_EMAIL");
  if (!resendKey || !healEmail) return;

  try {
    // Find failed escalations from the last 2 hours that haven't been retried yet
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const { data: failedEscalations } = await supabase
      .from("escalation_log")
      .select("id, incident_id, subject")
      .eq("status", "failed")
      .gte("created_at", twoHoursAgo)
      .limit(3);

    if (!failedEscalations || failedEscalations.length === 0) return;

    // Check cooldown
    const cooldownTime = new Date(Date.now() - ESCALATION_COOLDOWN_MIN * 60_000).toISOString();
    const { count: recentSent } = await supabase
      .from("escalation_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", cooldownTime);

    if ((recentSent || 0) >= 3) return;

    for (const failed of failedEscalations) {
      try {
        // Get the incident details for the email body
        const { data: incident } = failed.incident_id
          ? await supabase.from("incidents").select("*").eq("id", failed.incident_id).single()
          : { data: null };

        const subject = failed.subject || "[SENTINEL RETRY] Alert delivery retry";
        const html = incident
          ? buildEscalationEmail(incident)
          : `<p>Retrying failed alert. Original subject: ${failed.subject}</p>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "Sentinel AI <sentinel@thepeptideai.com>",
            to: [healEmail],
            subject: `[RETRY] ${subject}`,
            html,
          }),
        });

        if (res.ok) {
          // Mark the original as retried by updating its status
          await supabase
            .from("escalation_log")
            .update({ status: "sent", error_message: "Delivered on retry" })
            .eq("id", failed.id);
          stats.escalations_sent++;

          await supabase.from("heal_log").insert({
            action: "escalation_retry",
            result: "success",
            details: `Retried failed escalation ${failed.id} — delivered successfully`,
          });
        }
      } catch (err) {
        runErrors.push(`Escalation retry failed for ${failed.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    runErrors.push(`Escalation retry check: ${(err as Error).message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Auto-Rollback via Vercel API (NEW v3)
// ═══════════════════════════════════════════════════════════════

interface DeployCorrelation {
  incidentId: string;
  deployEventId: string;
  deploymentId: string;
  commitSha: string;
  errorCount: number;
  severity: string;
}

async function attemptAutoRollback(
  supabase: ReturnType<typeof createClient>,
  correlation: DeployCorrelation,
  stats: { rollbacks_attempted: number },
  runErrors: string[],
): Promise<void> {
  const vercelToken = Deno.env.get("VERCEL_TOKEN");
  if (!vercelToken) {
    // No Vercel token — log but don't fail
    await supabase.from("rollback_events").insert({
      deploy_event_id: correlation.deployEventId,
      incident_id: correlation.incidentId,
      status: "skipped",
      reason: "VERCEL_TOKEN not configured",
    });
    return;
  }

  // Only rollback if severity is critical and error count is significant
  if (correlation.severity !== "critical" || correlation.errorCount < 5) {
    await supabase.from("rollback_events").insert({
      deploy_event_id: correlation.deployEventId,
      incident_id: correlation.incidentId,
      status: "skipped",
      reason: `Below rollback threshold: severity=${correlation.severity}, errors=${correlation.errorCount}`,
    });
    return;
  }

  // Check if we already attempted a rollback for this deploy
  const { data: existingRollback } = await supabase
    .from("rollback_events")
    .select("id")
    .eq("deploy_event_id", correlation.deployEventId)
    .in("status", ["success", "pending"])
    .limit(1);

  if (existingRollback && existingRollback.length > 0) return; // Already attempted

  try {
    // Step 1: Get the previous successful deployment from Vercel
    const projectId = Deno.env.get("VERCEL_PROJECT_ID");
    if (!projectId) {
      await supabase.from("rollback_events").insert({
        deploy_event_id: correlation.deployEventId,
        incident_id: correlation.incidentId,
        status: "skipped",
        reason: "VERCEL_PROJECT_ID not configured",
      });
      return;
    }

    // Find the last good deployment (status: ready, before the bad one)
    const { data: previousDeploys } = await supabase
      .from("deploy_events")
      .select("deployment_id, commit_sha, deployed_at")
      .eq("status", "ready")
      .lt("deployed_at", correlation.commitSha ? undefined : new Date().toISOString())
      .neq("deployment_id", correlation.deploymentId)
      .order("deployed_at", { ascending: false })
      .limit(1);

    if (!previousDeploys || previousDeploys.length === 0) {
      await supabase.from("rollback_events").insert({
        deploy_event_id: correlation.deployEventId,
        incident_id: correlation.incidentId,
        status: "skipped",
        reason: "No previous successful deployment found to rollback to",
      });
      return;
    }

    const targetDeployment = previousDeploys[0];

    // Step 2: Trigger Vercel redeploy via API
    const rollbackRes = await fetch(`https://api.vercel.com/v13/deployments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectId,
        deploymentId: targetDeployment.deployment_id,
        target: "production",
      }),
    });

    if (rollbackRes.ok) {
      const rollbackData = await rollbackRes.json();
      stats.rollbacks_attempted++;

      await supabase.from("rollback_events").insert({
        deploy_event_id: correlation.deployEventId,
        incident_id: correlation.incidentId,
        rollback_to_deployment_id: targetDeployment.deployment_id,
        status: "success",
        reason: `Auto-rollback triggered. ${correlation.errorCount} errors after deploy ${correlation.deploymentId}. Rolling back to ${targetDeployment.deployment_id}`,
      });

      // Update incident
      await supabase
        .from("incidents")
        .update({ rollback_attempted: true, heal_action: `auto_rollback:${targetDeployment.deployment_id}` })
        .eq("id", correlation.incidentId);

      await supabase.from("heal_log").insert({
        action: "auto_rollback",
        result: "success",
        details: `Rolled back from ${correlation.deploymentId} to ${targetDeployment.deployment_id}. Trigger: ${correlation.errorCount} errors post-deploy.`,
      });
    } else {
      const errText = await rollbackRes.text();
      await supabase.from("rollback_events").insert({
        deploy_event_id: correlation.deployEventId,
        incident_id: correlation.incidentId,
        rollback_to_deployment_id: targetDeployment.deployment_id,
        status: "failed",
        reason: `Vercel API error: ${rollbackRes.status}`,
        error_message: errText.slice(0, 500),
      });

      await supabase.from("heal_log").insert({
        action: "auto_rollback",
        result: "failure",
        details: `Rollback failed: Vercel ${rollbackRes.status} — ${errText.slice(0, 200)}`,
      });
    }
  } catch (err) {
    runErrors.push(`Auto-rollback failed: ${(err as Error).message}`);
    await supabase.from("rollback_events").insert({
      deploy_event_id: correlation.deployEventId,
      incident_id: correlation.incidentId,
      status: "failed",
      error_message: (err as Error).message.slice(0, 500),
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Performance Anomaly Detection (NEW v3)
// ═══════════════════════════════════════════════════════════════
async function checkPerformanceAnomalies(
  supabase: ReturnType<typeof createClient>,
  stats: { anomalies_detected: number },
  runErrors: string[],
): Promise<void> {
  try {
    // Load baselines
    const { data: baselines } = await supabase
      .from("performance_baselines")
      .select("check_name, avg_latency_ms, p95_latency_ms, sample_count")
      .eq("window_hours", 24)
      .gt("sample_count", 5); // Only use baselines with enough samples

    if (!baselines || baselines.length === 0) return;

    // Get most recent health check results
    const { data: latestChecks } = await supabase
      .from("health_checks")
      .select("check_name, latency_ms, checked_at")
      .order("checked_at", { ascending: false })
      .limit(50);

    if (!latestChecks || latestChecks.length === 0) return;

    // Get the latest check per name
    const latestByName: Record<string, { latency_ms: number; checked_at: string }> = {};
    for (const c of latestChecks) {
      if (!latestByName[c.check_name]) {
        latestByName[c.check_name] = { latency_ms: c.latency_ms, checked_at: c.checked_at };
      }
    }

    // Compare each check against its baseline
    for (const baseline of baselines) {
      const latest = latestByName[baseline.check_name];
      if (!latest || latest.latency_ms <= 0) continue;

      const threshold = baseline.avg_latency_ms * ANOMALY_THRESHOLD_MULTIPLIER;
      if (latest.latency_ms > threshold && latest.latency_ms > 500) { // At least 500ms to avoid noise
        stats.anomalies_detected++;

        // Check if we already flagged this recently
        const recentWindow = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: recentAnomaly } = await supabase
          .from("incidents")
          .select("id")
          .eq("source", "sentinel")
          .ilike("title", `%performance anomaly%${baseline.check_name}%`)
          .gte("detected_at", recentWindow)
          .limit(1);

        if (!recentAnomaly || recentAnomaly.length === 0) {
          await supabase.from("incidents").insert({
            title: `[Performance Anomaly] ${baseline.check_name}: ${latest.latency_ms}ms (baseline: ${Math.round(baseline.avg_latency_ms)}ms)`,
            severity: latest.latency_ms > baseline.p95_latency_ms * 3 ? "high" : "medium",
            status: "detected",
            source: "sentinel",
            error_pattern: `${baseline.check_name} latency ${latest.latency_ms}ms > ${ANOMALY_THRESHOLD_MULTIPLIER}x baseline ${Math.round(baseline.avg_latency_ms)}ms`,
            diagnosis: `Performance degradation detected. Current: ${latest.latency_ms}ms, 24h avg: ${Math.round(baseline.avg_latency_ms)}ms, p95: ${Math.round(baseline.p95_latency_ms)}ms.`,
            metadata: {
              check_name: baseline.check_name,
              current_latency: latest.latency_ms,
              baseline_avg: baseline.avg_latency_ms,
              baseline_p95: baseline.p95_latency_ms,
              multiplier: Math.round((latest.latency_ms / baseline.avg_latency_ms) * 100) / 100,
            },
          });

          await supabase.from("heal_log").insert({
            action: "anomaly_detection",
            result: "success",
            details: `Performance anomaly: ${baseline.check_name} at ${latest.latency_ms}ms (${Math.round(latest.latency_ms / baseline.avg_latency_ms * 100) / 100}x baseline)`,
          });
        }
      }
    }
  } catch (err) {
    runErrors.push(`Performance anomaly check: ${(err as Error).message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Existing helpers (unchanged)
// ═══════════════════════════════════════════════════════════════

async function createAutoIncident(
  supabase: ReturnType<typeof createClient>,
  bug: BugReport,
  pattern: ErrorPattern,
): Promise<void> {
  const { data: existing } = await supabase
    .from("incidents")
    .select("id")
    .eq("source", "sentinel")
    .in("status", ["detected", "diagnosing", "healing"])
    .ilike("error_pattern", `%${pattern.pattern.slice(0, 50)}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase
      .from("incidents")
      .update({
        metadata: {
          latest_bug_id: bug.id,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", existing[0].id);
    return;
  }

  await supabase.from("incidents").insert({
    title: `[Sentinel] ${pattern.category}: ${pattern.pattern.slice(0, 80)}`,
    severity: pattern.severity,
    status: "detected",
    source: "sentinel",
    error_pattern: pattern.pattern,
    diagnosis: pattern.fix_description,
    metadata: {
      pattern_id: pattern.id,
      bug_id: bug.id,
      page_url: bug.page_url,
      auto_created: true,
    },
  });
}

async function tripCircuitBreaker(
  supabase: ReturnType<typeof createClient>,
  bug: BugReport,
  pattern: ErrorPattern,
): Promise<void> {
  const features = CATEGORY_TO_FEATURES[pattern.category] || [];
  if (features.length === 0) {
    await createAutoIncident(supabase, bug, pattern);
    return;
  }

  for (const featureKey of features) {
    const orgId = bug.org_id;
    if (orgId) {
      await supabase
        .from("org_features")
        .upsert(
          { org_id: orgId, feature_key: featureKey, enabled: false, updated_at: new Date().toISOString() },
          { onConflict: "org_id,feature_key" },
        );
    }

    await supabase.from("circuit_breaker_events").insert({
      feature_key: featureKey,
      org_id: orgId,
      action: "tripped",
      reason: `Pattern "${pattern.pattern}" matched. ${pattern.fix_description}`,
      error_count: pattern.times_matched,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });

    await supabase.from("incidents").insert({
      title: `[Circuit Breaker] ${featureKey} disabled for ${orgId ? "org " + orgId.slice(0, 8) : "all orgs"}`,
      severity: pattern.severity,
      status: "healing",
      source: "sentinel",
      error_pattern: pattern.pattern,
      diagnosis: `Circuit breaker tripped. Feature "${featureKey}" auto-disabled. Root cause: ${pattern.fix_description}`,
      auto_healed: true,
      heal_action: `circuit_breaker:${featureKey}`,
      metadata: {
        pattern_id: pattern.id,
        feature_key: featureKey,
        org_id: orgId,
        auto_disabled: true,
      },
    });
  }
}

async function disableFeature(
  supabase: ReturnType<typeof createClient>,
  bug: BugReport,
  pattern: ErrorPattern,
): Promise<void> {
  await tripCircuitBreaker(supabase, bug, pattern);
}

async function correlateWithDeploys(
  supabase: ReturnType<typeof createClient>,
  bugs: BugReport[],
  runErrors: string[],
): Promise<DeployCorrelation | null> {
  if (bugs.length === 0) return null;

  try {
    const windowStart = new Date(Date.now() - DEPLOY_CORRELATION_WINDOW_MIN * 60_000).toISOString();
    const { data: recentDeploys } = await supabase
      .from("deploy_events")
      .select("id, deployment_id, commit_sha, commit_message, deployed_at, status")
      .gte("deployed_at", windowStart)
      .order("deployed_at", { ascending: false })
      .limit(5);

    if (!recentDeploys || recentDeploys.length === 0) return null;

    const earliestBug = bugs[0].created_at;
    const latestDeploy = recentDeploys[0];

    const deployTime = new Date(latestDeploy.deployed_at).getTime();
    const bugTime = new Date(earliestBug).getTime();
    const diffMin = (bugTime - deployTime) / 60_000;

    if (diffMin >= 0 && diffMin <= 30 && bugs.length >= 3) {
      const { data: existingCorrelation } = await supabase
        .from("incidents")
        .select("id")
        .eq("source", "sentinel")
        .ilike("title", "%deploy correlation%")
        .gte("detected_at", windowStart)
        .limit(1);

      let incidentId = existingCorrelation?.[0]?.id;

      if (!incidentId) {
        const severity = bugs.length >= 10 ? "critical" : "high";
        const { data: newIncident } = await supabase.from("incidents").insert({
          title: `[Deploy Correlation] ${bugs.length} errors after deploy ${latestDeploy.commit_sha?.slice(0, 7) || "unknown"}`,
          severity,
          status: "detected",
          source: "sentinel",
          error_pattern: `Deploy ${latestDeploy.deployment_id} → ${bugs.length} errors within ${Math.round(diffMin)}min`,
          diagnosis: `Commit: ${latestDeploy.commit_message?.slice(0, 100)}. ${bugs.length} errors detected within ${Math.round(diffMin)} minutes of deployment.`,
          metadata: {
            deploy_id: latestDeploy.deployment_id,
            commit_sha: latestDeploy.commit_sha,
            commit_message: latestDeploy.commit_message,
            error_count: bugs.length,
            minutes_after_deploy: Math.round(diffMin),
          },
        }).select("id").single();

        incidentId = newIncident?.id;
      }

      return {
        incidentId: incidentId || "",
        deployEventId: latestDeploy.id,
        deploymentId: latestDeploy.deployment_id || "",
        commitSha: latestDeploy.commit_sha || "",
        errorCount: bugs.length,
        severity: bugs.length >= 10 ? "critical" : "high",
      };
    }
  } catch (err) {
    runErrors.push(`Deploy correlation: ${(err as Error).message}`);
  }

  return null;
}

async function checkAggregateCircuitBreakers(
  supabase: ReturnType<typeof createClient>,
  stats: { circuit_breakers_tripped: number },
  runErrors: string[],
): Promise<void> {
  try {
    const windowStart = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MIN * 60_000).toISOString();

    const { data: recentBugs } = await supabase
      .from("bug_reports")
      .select("id, description, org_id, sentinel_pattern_id")
      .gte("created_at", windowStart)
      .not("sentinel_pattern_id", "is", null);

    if (!recentBugs || recentBugs.length < CIRCUIT_BREAKER_THRESHOLD) return;

    const patternCounts: Record<string, { count: number; orgIds: Set<string> }> = {};
    for (const bug of recentBugs) {
      const key = bug.sentinel_pattern_id;
      if (!patternCounts[key]) patternCounts[key] = { count: 0, orgIds: new Set() };
      patternCounts[key].count++;
      if (bug.org_id) patternCounts[key].orgIds.add(bug.org_id);
    }

    for (const [patternId, info] of Object.entries(patternCounts)) {
      if (info.count >= CIRCUIT_BREAKER_THRESHOLD) {
        const { data: pat } = await supabase
          .from("error_patterns")
          .select("category, pattern, severity")
          .eq("id", patternId)
          .single();

        if (!pat) continue;

        const features = CATEGORY_TO_FEATURES[pat.category] || [];
        for (const featureKey of features) {
          const { data: recentTrip } = await supabase
            .from("circuit_breaker_events")
            .select("id")
            .eq("feature_key", featureKey)
            .eq("action", "tripped")
            .gte("created_at", windowStart)
            .limit(1);

          if (recentTrip && recentTrip.length > 0) continue;

          for (const orgId of info.orgIds) {
            await supabase
              .from("org_features")
              .upsert(
                { org_id: orgId, feature_key: featureKey, enabled: false, updated_at: new Date().toISOString() },
                { onConflict: "org_id,feature_key" },
              );
          }

          await supabase.from("circuit_breaker_events").insert({
            feature_key: featureKey,
            action: "tripped",
            reason: `Aggregate: ${info.count} errors matching "${pat.pattern}" in ${CIRCUIT_BREAKER_WINDOW_MIN}min window`,
            error_count: info.count,
            threshold: CIRCUIT_BREAKER_THRESHOLD,
          });

          stats.circuit_breakers_tripped++;
        }
      }
    }

    // Auto-reset circuit breakers
    const { data: recentBreakers } = await supabase
      .from("circuit_breaker_events")
      .select("feature_key, org_id, created_at")
      .eq("action", "tripped")
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
      .order("created_at", { ascending: false });

    if (recentBreakers) {
      for (const breaker of recentBreakers) {
        const features = Object.entries(FEATURE_CIRCUIT_MAP).find(([k]) => k === breaker.feature_key);
        if (!features) continue;

        const { data: recentErrors } = await supabase
          .from("bug_reports")
          .select("id")
          .gte("created_at", windowStart)
          .not("sentinel_pattern_id", "is", null)
          .limit(1);

        if (!recentErrors || recentErrors.length === 0) {
          if (breaker.org_id) {
            await supabase
              .from("org_features")
              .upsert(
                { org_id: breaker.org_id, feature_key: breaker.feature_key, enabled: true, updated_at: new Date().toISOString() },
                { onConflict: "org_id,feature_key" },
              );
          }

          await supabase.from("circuit_breaker_events").insert({
            feature_key: breaker.feature_key,
            org_id: breaker.org_id,
            action: "reset",
            reason: "Error rate dropped to 0 — auto-resetting circuit breaker",
          });
        }
      }
    }
  } catch (err) {
    runErrors.push(`Aggregate circuit breaker check: ${(err as Error).message}`);
  }
}

async function doHousekeeping(supabase: ReturnType<typeof createClient>): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from("incidents")
    .update({ status: "resolved", resolved_at: now, auto_healed: true })
    .eq("source", "sentinel")
    .in("status", ["detected", "diagnosing"])
    .lt("detected_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  await supabase.from("sentinel_runs").delete().lt("started_at", thirtyDaysAgo);
  await supabase.from("circuit_breaker_events").delete().lt("created_at", thirtyDaysAgo);
  await supabase.from("escalation_log").delete().lt("created_at", thirtyDaysAgo);
  await supabase.from("rollback_events").delete().lt("created_at", thirtyDaysAgo);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  await supabase
    .from("bug_reports")
    .update({ status: "resolved", resolved_at: now })
    .eq("status", "open")
    .not("sentinel_processed_at", "is", null)
    .lt("created_at", sevenDaysAgo);
}

/**
 * Phase 12: Business Logic Auto-Repair
 * Reads recent health_check failures with category='business_logic'
 * and applies targeted fixes for each known violation type.
 */
async function repairBusinessLogicViolations(
  supabase: ReturnType<typeof createClient>,
  stats: Record<string, number>,
  runErrors: string[],
): Promise<void> {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: violations } = await supabase
      .from("health_checks")
      .select("check_name, error_message")
      .eq("category", "business_logic")
      .neq("status", "pass")
      .gte("checked_at", tenMinAgo);

    if (!violations?.length) return;

    const seen = new Set<string>();
    for (const v of violations) {
      if (seen.has(v.check_name)) continue;
      seen.add(v.check_name);

      try {
        switch (v.check_name) {
          case "biz:fulfilled_no_commission": {
            // Re-trigger commission calculation for fulfilled+paid orders missing commissions
            const { data: orders } = await supabase
              .from("sales_orders")
              .select("id")
              .eq("status", "fulfilled")
              .eq("payment_status", "paid")
              .limit(20);
            if (!orders?.length) break;
            const { data: comms } = await supabase
              .from("commission_transactions")
              .select("sales_order_id")
              .in("sales_order_id", orders.map((o) => o.id));
            const commSet = new Set(comms?.map((c) => c.sales_order_id) ?? []);
            const missing = orders.filter((o) => !commSet.has(o.id));
            for (const order of missing.slice(0, 5)) {
              await supabase.rpc("process_sale_commission", { p_order_id: order.id }).catch(() => {});
              stats.fixes_applied++;
            }
            await logHealAction(supabase, "biz:fulfilled_no_commission", `Triggered commission for ${missing.length} orders`);
            break;
          }

          case "biz:unapplied_commissions": {
            // Apply pending commissions
            await supabase.rpc("apply_commissions_to_owed").catch(() => {});
            stats.fixes_applied++;
            await logHealAction(supabase, "biz:unapplied_commissions", "Ran apply_commissions_to_owed RPC");
            break;
          }

          case "biz:negative_credit": {
            // Set negative credits to 0
            const { data: negProfiles } = await supabase
              .from("profiles")
              .select("id, store_credit")
              .lt("store_credit", 0)
              .limit(50);
            if (negProfiles?.length) {
              for (const p of negProfiles) {
                await supabase
                  .from("profiles")
                  .update({ store_credit: 0 })
                  .eq("id", p.id);
              }
              stats.fixes_applied++;
              await logHealAction(supabase, "biz:negative_credit", `Reset ${negProfiles.length} profiles from negative credit`);
            }
            break;
          }

          case "biz:orphaned_orders": {
            // Cancel orders with no items (older than 10 min)
            const tenMinAgo2 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: allOrders } = await supabase
              .from("sales_orders")
              .select("id")
              .lt("created_at", tenMinAgo2)
              .neq("status", "cancelled")
              .limit(100);
            if (!allOrders?.length) break;
            const { data: items } = await supabase
              .from("sales_order_items")
              .select("sales_order_id")
              .in("sales_order_id", allOrders.map((o) => o.id));
            const hasItems = new Set(items?.map((i) => i.sales_order_id) ?? []);
            const orphaned = allOrders.filter((o) => !hasItems.has(o.id));
            if (orphaned.length) {
              await supabase
                .from("sales_orders")
                .update({ status: "cancelled", notes: "Auto-cancelled: no order items (sentinel Phase 12)" })
                .in("id", orphaned.map((o) => o.id));
              stats.fixes_applied++;
              await logHealAction(supabase, "biz:orphaned_orders", `Cancelled ${orphaned.length} orphaned orders`);
            }
            break;
          }

          case "biz:orphaned_bottles": {
            // Mark orphaned sold bottles as 'lost'
            const { data: orphanedBottles } = await supabase
              .from("bottles")
              .select("id")
              .eq("status", "sold")
              .is("order_item_id", null)
              .limit(50);
            if (orphanedBottles?.length) {
              await supabase
                .from("bottles")
                .update({ status: "lost", notes: "Auto-marked lost: sold but no order item (sentinel Phase 12)" })
                .in("id", orphanedBottles.map((b) => b.id));
              stats.fixes_applied++;
              await logHealAction(supabase, "biz:orphaned_bottles", `Marked ${orphanedBottles.length} orphaned bottles as lost`);
            }
            break;
          }

          case "biz:stale_payment_queue": {
            // Re-trigger payment scan for stale entries
            const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
            const cronSecret = Deno.env.get("CRON_SECRET") || "";
            if (supabaseUrl && cronSecret) {
              await fetch(`${supabaseUrl}/functions/v1/process-payments`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${cronSecret}`, "Content-Type": "application/json" },
                body: JSON.stringify({ source: "sentinel-phase12" }),
              }).catch(() => {});
              stats.fixes_applied++;
              await logHealAction(supabase, "biz:stale_payment_queue", "Re-triggered process-payments edge function");
            }
            break;
          }

          default: {
            // Unknown biz check — log as escalation
            await supabase.from("error_log").insert({
              level: "warning",
              source: "sentinel:phase12",
              message: `Unhandled business logic violation: ${v.check_name} — ${v.error_message}`,
            }).catch(() => {});
            break;
          }
        }
      } catch (fixErr) {
        runErrors.push(`Phase12 fix ${v.check_name}: ${(fixErr as Error).message}`);
      }
    }
  } catch (err) {
    runErrors.push(`Phase12: ${(err as Error).message}`);
  }
}

async function logHealAction(
  supabase: ReturnType<typeof createClient>,
  check: string,
  action: string,
): Promise<void> {
  await supabase.from("heal_log").insert({
    source: "sentinel:phase12",
    action_type: "auto_fix",
    description: `[${check}] ${action}`,
    created_at: new Date().toISOString(),
  }).catch(() => {});
}

async function finishRun(
  supabase: ReturnType<typeof createClient>,
  runId: string | undefined,
  stats: Record<string, number>,
  errors: string[],
  status: string,
): Promise<void> {
  if (!runId) return;
  await supabase
    .from("sentinel_runs")
    .update({
      finished_at: new Date().toISOString(),
      bugs_processed: stats.bugs_processed,
      patterns_matched: stats.patterns_matched,
      ai_diagnoses: stats.ai_diagnoses,
      fixes_applied: stats.fixes_applied,
      circuit_breakers_tripped: stats.circuit_breakers_tripped,
      schema_fixes_applied: stats.schema_fixes_applied || 0,
      errors: errors.length > 0 ? errors : null,
      status,
    })
    .eq("id", runId);
}

// ═══════════════════════════════════════════════════════════════
// Phase 13: Autonomous Schema Healer
// ═══════════════════════════════════════════════════════════════

type SchemaErrorClass = "missing_column" | "missing_relation" | "broken_function" | "unknown";

function classifySchemaError(errorText: string): { type: SchemaErrorClass; table?: string; column?: string; relation?: string } {
  // "column expenses.org_id does not exist" or "column \"org_id\" of relation \"expenses\" does not exist"
  const colMatch = errorText.match(/column\s+(?:"?(\w+)"?\.)?["]?(\w+)["]?\s+(?:of\s+relation\s+["]?(\w+)["]?\s+)?does\s+not\s+exist/i);
  if (colMatch) {
    const table = colMatch[3] || colMatch[1];
    const column = colMatch[2];
    return { type: "missing_column", table, column };
  }

  // "relation \"discussion_replies\" does not exist"
  const relMatch = errorText.match(/relation\s+["]?(\w+)["]?\s+does\s+not\s+exist/i);
  if (relMatch) {
    return { type: "missing_relation", relation: relMatch[1] };
  }

  // PG error codes
  if (errorText.includes("42703")) return { type: "missing_column" };
  if (errorText.includes("42P01")) return { type: "missing_relation" };

  return { type: "unknown" };
}

async function healSchemaErrors(
  supabase: ReturnType<typeof createClient>,
  stats: Record<string, number>,
  runErrors: string[],
): Promise<void> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    runErrors.push("Phase13: OPENAI_API_KEY not set");
    return;
  }

  try {
    // Collect bugs that need schema healing from TWO sources:
    // 1. AI-diagnosed bugs with "AUTO-FIX POSSIBLE? Yes" that contain schema error text
    // 2. Pattern-matched bugs where auto_fix_action = 'schema_heal' (Phase 5 skips these)
    const schemaPatterns = [/does not exist/i, /42703/, /42P01/];

    // Source 1: AI-diagnosed bugs
    const { data: aiDiagnosedBugs } = await supabase
      .from("bug_reports")
      .select("id, description, console_errors, page_url, org_id, sentinel_diagnosis")
      .not("sentinel_diagnosis", "is", null)
      .ilike("sentinel_diagnosis", "%AUTO-FIX POSSIBLE?%Yes%")
      .is("sentinel_schema_healed", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Source 2: Pattern-matched bugs with schema_heal action (these have sentinel_pattern_id set)
    const { data: patternMatchedBugs } = await supabase
      .from("bug_reports")
      .select("id, description, console_errors, page_url, org_id, sentinel_diagnosis, sentinel_pattern_id")
      .not("sentinel_pattern_id", "is", null)
      .is("sentinel_schema_healed", null)
      .not("sentinel_processed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Merge and deduplicate
    const seenIds = new Set<string>();
    // deno-lint-ignore no-explicit-any
    const allCandidates: any[] = [];
    for (const bug of [...(aiDiagnosedBugs || []), ...(patternMatchedBugs || [])]) {
      if (!seenIds.has(bug.id)) {
        seenIds.add(bug.id);
        allCandidates.push(bug);
      }
    }

    if (allCandidates.length === 0) {
      return;
    }

    // Filter to schema-related errors only
    const schemaBugs = allCandidates.filter((bug) => {
      const errorText = buildErrorText(bug as BugReport);
      return schemaPatterns.some((p) => p.test(errorText));
    });

    if (schemaBugs.length === 0) {
      return;
    }

    let fixesThisRun = 0;
    const processedFingerprints = new Set<string>(); // Prevent duplicates within a single run

    for (const bug of schemaBugs) {
      if (fixesThisRun >= MAX_SCHEMA_FIXES_PER_RUN) break;

      const errorText = buildErrorText(bug as BugReport);
      const fingerprint = errorText.replace(/\s+/g, " ").trim().slice(0, 200);

      // In-run dedup: skip if we already processed this fingerprint this run
      if (processedFingerprints.has(fingerprint)) {
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "already_fixed" }).eq("id", bug.id);
        continue;
      }

      // Check cooldown: same fingerprint in last 24h?
      const cooldownCutoff = new Date(Date.now() - SCHEMA_FIX_COOLDOWN_HOURS * 3600_000).toISOString();
      const { data: recentFixes } = await supabase
        .from("schema_heal_log")
        .select("id, execution_result")
        .eq("error_fingerprint", fingerprint)
        .gte("created_at", cooldownCutoff)
        .limit(5);

      if (recentFixes && recentFixes.length > 0) {
        // Skip if already attempted — check for consecutive failures
        const failures = recentFixes.filter((f) => f.execution_result === "failed");
        if (failures.length >= 2) {
          // Too many failures for this fingerprint — escalate and skip
          runErrors.push(`Phase13: Skipping fingerprint (2+ failures): ${fingerprint.slice(0, 80)}`);
          await supabase.from("bug_reports").update({ sentinel_schema_healed: "escalated" }).eq("id", bug.id);
          processedFingerprints.add(fingerprint);
          continue;
        }
        if (recentFixes.some((f) => f.execution_result === "success")) {
          // Already fixed successfully
          await supabase.from("bug_reports").update({ sentinel_schema_healed: "already_fixed" }).eq("id", bug.id);
          processedFingerprints.add(fingerprint);
          continue;
        }
      }

      // Classify the error
      const classification = classifySchemaError(errorText);
      if (classification.type === "unknown") {
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "unclassified" }).eq("id", bug.id);
        continue;
      }

      // Introspect schema for context
      let schemaContext = "";
      let preState: Record<string, unknown> | null = null;

      if (classification.type === "missing_column" && classification.table) {
        const columns = await getTableColumns(classification.table);
        schemaContext += `Table "${classification.table}" columns: ${columns.map((c) => `${c.column_name} ${c.udt_name}`).join(", ")}\n`;

        if (classification.column) {
          const otherTables = await findColumnInOtherTables(classification.column);
          if (otherTables.length > 0) {
            schemaContext += `Column "${classification.column}" found in: ${otherTables.map((t) => `${t.table_name} (${t.udt_name})`).join(", ")}\n`;
          }
        }
      } else if (classification.type === "missing_relation" && classification.relation) {
        const exists = await tableExists(classification.relation);
        schemaContext += `Table "${classification.relation}" exists: ${exists}\n`;

        // Check if it's referenced in a function
        const errorHasFunction = errorText.match(/function\s+(\w+)/i);
        if (errorHasFunction) {
          const funcSource = await getFunctionSource(errorHasFunction[1]);
          if (funcSource) {
            schemaContext += `Function source:\n${funcSource.slice(0, 1500)}\n`;
            preState = { function_name: errorHasFunction[1], source: funcSource };
          }
        }
      } else if (classification.type === "broken_function") {
        const funcMatch = errorText.match(/function\s+(\w+)/i);
        if (funcMatch) {
          const funcSource = await getFunctionSource(funcMatch[1]);
          if (funcSource) {
            schemaContext += `Function source:\n${funcSource.slice(0, 1500)}\n`;
            preState = { function_name: funcMatch[1], source: funcSource };
          }
        }
      }

      // AI-generate the fix
      const fix = await aiGenerateFix(openaiKey, errorText, classification.type, schemaContext);
      if (!fix) {
        runErrors.push(`Phase13: AI fix generation failed for bug ${bug.id}`);
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "ai_failed" }).eq("id", bug.id);
        continue;
      }

      // Validate SQL safety
      const validation = validateSql(fix.sql);
      if (!validation.safe) {
        await supabase.from("schema_heal_log").insert({
          bug_id: bug.id,
          error_fingerprint: fingerprint,
          error_message: errorText.slice(0, 1000),
          generated_sql: fix.sql,
          explanation: fix.explanation,
          risk_level: fix.risk,
          pre_state: preState,
          execution_result: "blocked",
          execution_error: `Safety validation failed: ${validation.reason}`,
        });
        runErrors.push(`Phase13: SQL blocked for bug ${bug.id}: ${validation.reason}`);
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "blocked" }).eq("id", bug.id);
        processedFingerprints.add(fingerprint);
        continue;
      }

      // High risk → skip and escalate
      if (fix.risk === "high") {
        await supabase.from("schema_heal_log").insert({
          bug_id: bug.id,
          error_fingerprint: fingerprint,
          error_message: errorText.slice(0, 1000),
          generated_sql: fix.sql,
          explanation: fix.explanation,
          risk_level: "high",
          pre_state: preState,
          execution_result: "skipped",
          execution_error: "High risk — escalated for human review",
        });
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "escalated" }).eq("id", bug.id);
        processedFingerprints.add(fingerprint);
        continue;
      }

      // Insert pending log entry
      const { data: healLog } = await supabase.from("schema_heal_log").insert({
        bug_id: bug.id,
        error_fingerprint: fingerprint,
        error_message: errorText.slice(0, 1000),
        generated_sql: fix.sql,
        explanation: fix.explanation,
        risk_level: fix.risk,
        pre_state: preState,
        execution_result: "pending",
      }).select("id").single();

      // Execute via Management API
      const execResult = await executeMgmtQuery(fix.sql);

      if (execResult.success) {
        // Update log as success
        await supabase.from("schema_heal_log").update({
          execution_result: "success",
          applied_at: new Date().toISOString(),
        }).eq("id", healLog?.id);

        // PostgREST reload
        await executeMgmtQuery("NOTIFY pgrst, 'reload schema';");

        // Mark bug as healed
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "fixed" }).eq("id", bug.id);

        // Auto-learn: add error_pattern for instant matching next time
        try {
          const patternText = errorText.replace(/['"]/g, "").slice(0, 200);
          await supabase.from("error_patterns").insert({
            pattern: patternText,
            match_type: "substring",
            category: "schema",
            severity: "critical",
            auto_fix_action: "schema_heal",
            fix_description: `Auto-learned: ${fix.explanation?.slice(0, 200)}`,
            cooldown_minutes: 60,
            enabled: true,
          });
        } catch { /* Don't fail if pattern already exists */ }

        // Log to heal_log
        try {
          await supabase.from("heal_log").insert({
            source: "sentinel:phase13",
            action_type: "schema_heal",
            description: `[schema_heal] Applied: ${fix.sql.slice(0, 200)}`,
            created_at: new Date().toISOString(),
          });
        } catch { /* non-critical */ }

        stats.schema_fixes_applied++;
        fixesThisRun++;
        processedFingerprints.add(fingerprint);
      } else {
        // Update log as failed
        await supabase.from("schema_heal_log").update({
          execution_result: "failed",
          execution_error: execResult.error?.slice(0, 500),
        }).eq("id", healLog?.id);

        runErrors.push(`Phase13: DDL execution failed for bug ${bug.id}: ${execResult.error?.slice(0, 100)}`);
        await supabase.from("bug_reports").update({ sentinel_schema_healed: "failed" }).eq("id", bug.id);
        processedFingerprints.add(fingerprint);
      }
    }
  } catch (err) {
    runErrors.push(`Phase13: ${(err as Error).message}`);
  }
}

interface AiFix {
  sql: string;
  explanation: string;
  risk: "low" | "medium" | "high";
}

async function aiGenerateFix(
  apiKey: string,
  errorText: string,
  errorType: SchemaErrorClass,
  schemaContext: string,
): Promise<AiFix | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: AI_FIX_MAX_TOKENS,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You are a PostgreSQL schema repair agent for a multi-tenant SaaS application.
Generate MINIMAL, SAFE SQL to fix the error. Rules:
- ONLY use: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, CREATE INDEX IF NOT EXISTS, GRANT SELECT/INSERT/UPDATE/EXECUTE
- NEVER use: DROP, TRUNCATE, DELETE, INSERT, UPDATE, CREATE TABLE, ALTER TABLE ... DROP, ALTER TABLE ... RENAME
- NEVER touch auth.* or storage.* schemas
- Generate ONE statement only (or one CREATE OR REPLACE FUNCTION block)
- For missing columns: The table name MUST come from the error message itself (e.g., "column expenses.org_id" means table=expenses). If the error is from inside a function (like an RPC call), the missing column belongs to whichever table the function's SQL references, NOT the function name or its parameter types.
- For missing columns: infer type from the "Schema context" section showing the same column in other tables. Default to uuid if FK pattern, text if truly unknown.
- For missing relations in functions: fix the function to use the correct existing table name. If you cannot determine the correct table, set RISK: high.
- Use IF NOT EXISTS / IF EXISTS where possible
- If you are uncertain about the fix, set RISK: high instead of guessing

Respond in EXACTLY this format (no markdown, no extra text):
SQL: <your single SQL statement>
EXPLANATION: <one sentence>
RISK: low|medium|high`,
          },
          {
            role: "user",
            content: `Error type: ${errorType}\nError: ${errorText.slice(0, 800)}\n\nSchema context:\n${schemaContext.slice(0, 1500)}`,
          },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    // Parse structured response
    const sqlMatch = content.match(/SQL:\s*(.+?)(?=\nEXPLANATION:)/s);
    const explMatch = content.match(/EXPLANATION:\s*(.+?)(?=\nRISK:)/s);
    const riskMatch = content.match(/RISK:\s*(low|medium|high)/i);

    if (!sqlMatch) return null;

    return {
      sql: sqlMatch[1].trim(),
      explanation: explMatch?.[1]?.trim() || "No explanation provided",
      risk: (riskMatch?.[1]?.toLowerCase() as "low" | "medium" | "high") || "medium",
    };
  } catch (err) {
    clearTimeout(timeout);
    return null;
  }
}
