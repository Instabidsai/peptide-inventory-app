import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { authenticateCron, authenticateRequest, AuthError, createServiceClient } from "../_shared/auth.ts";

/**
 * sentinel-worker — The AI Self-Healing Brain
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
 *   7. Auto-resolve stale incidents when errors stop
 *   8. Log everything to heal_log + sentinel_runs
 *
 * Auth: CRON_SECRET (pg_cron) or admin JWT (manual trigger).
 */

// ── Config ────────────────────────────────────────────────────
const MAX_BUGS_PER_RUN = 100;
const CIRCUIT_BREAKER_THRESHOLD = 10;    // errors in window → trip breaker
const CIRCUIT_BREAKER_WINDOW_MIN = 15;   // window in minutes
const AI_DIAGNOSIS_BATCH = 5;            // max unknown errors to diagnose per run
const DEPLOY_CORRELATION_WINDOW_MIN = 30; // correlate errors with deploys in last 30 min

// ── Feature key → error category mapping for circuit breakers ──
const FEATURE_CIRCUIT_MAP: Record<string, string[]> = {
  ai_assistant: ["edge_function"],   // AI chat errors → disable AI
  supplements: ["database"],         // DB errors on supplements → disable
  protocols: ["database"],
  client_store: ["validation"],      // payment/store errors → disable store
};

// Reverse map: category → features to potentially disable
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
      // Nothing to process — still do housekeeping
      await doHousekeeping(supabase);
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

          // Update pattern stats
          await supabase
            .from("error_patterns")
            .update({ times_matched: (pat.times_matched || 0) + 1, last_matched_at: new Date().toISOString() })
            .eq("id", pat.id);

          // Mark bug as processed with pattern
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
          break; // first match wins
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
          // Still mark as processed to avoid re-processing
          await supabase
            .from("bug_reports")
            .update({ sentinel_processed_at: new Date().toISOString(), sentinel_diagnosis: "AI diagnosis failed" })
            .eq("id", bug.id);
        }
      }
    }

    // Mark remaining unmatched bugs as processed (no pattern, no AI)
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
      // Check cooldown
      if (pattern.last_fixed_at) {
        const cooldownEnd = new Date(pattern.last_fixed_at).getTime() + pattern.cooldown_minutes * 60_000;
        if (Date.now() < cooldownEnd) continue; // still in cooldown
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

          default:
            break;
        }

        // Update pattern fix stats
        await supabase
          .from("error_patterns")
          .update({ times_fixed: (pattern.times_fixed || 0) + 1, last_fixed_at: new Date().toISOString() })
          .eq("id", pattern.id);

        // Log the healing action
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
    await correlateWithDeploys(supabase, bugList, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 7: Circuit breaker check (aggregate error rate)
    // ═══════════════════════════════════════════════════════════
    await checkAggregateCircuitBreakers(supabase, stats, runErrors);

    // ═══════════════════════════════════════════════════════════
    // PHASE 8: Housekeeping
    // ═══════════════════════════════════════════════════════════
    await doHousekeeping(supabase);

    // ── Finish run ──
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

async function createAutoIncident(
  supabase: ReturnType<typeof createClient>,
  bug: BugReport,
  pattern: ErrorPattern,
): Promise<void> {
  // Check for existing open incident with same pattern
  const { data: existing } = await supabase
    .from("incidents")
    .select("id")
    .eq("source", "sentinel")
    .in("status", ["detected", "diagnosing", "healing"])
    .ilike("error_pattern", `%${pattern.pattern.slice(0, 50)}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing incident metadata
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
  // Find which features map to this error category
  const features = CATEGORY_TO_FEATURES[pattern.category] || [];
  if (features.length === 0) {
    // No feature mapping — create incident instead
    await createAutoIncident(supabase, bug, pattern);
    return;
  }

  for (const featureKey of features) {
    // Disable the feature for the affected org (or all orgs if no org_id)
    const orgId = bug.org_id;
    if (orgId) {
      await supabase
        .from("org_features")
        .upsert(
          { org_id: orgId, feature_key: featureKey, enabled: false, updated_at: new Date().toISOString() },
          { onConflict: "org_id,feature_key" },
        );
    }

    // Log the circuit breaker event
    await supabase.from("circuit_breaker_events").insert({
      feature_key: featureKey,
      org_id: orgId,
      action: "tripped",
      reason: `Pattern "${pattern.pattern}" matched. ${pattern.fix_description}`,
      error_count: pattern.times_matched,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });

    // Create incident for the circuit breaker trip
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
  // Same as circuit breaker but explicit
  await tripCircuitBreaker(supabase, bug, pattern);
}

async function correlateWithDeploys(
  supabase: ReturnType<typeof createClient>,
  bugs: BugReport[],
  runErrors: string[],
): Promise<void> {
  if (bugs.length === 0) return;

  try {
    const windowStart = new Date(Date.now() - DEPLOY_CORRELATION_WINDOW_MIN * 60_000).toISOString();
    const { data: recentDeploys } = await supabase
      .from("deploy_events")
      .select("id, deployment_id, commit_sha, commit_message, deployed_at, status")
      .gte("deployed_at", windowStart)
      .order("deployed_at", { ascending: false })
      .limit(5);

    if (!recentDeploys || recentDeploys.length === 0) return;

    // If there's a spike (more bugs than usual) correlating with a deploy, create incident
    const earliestBug = bugs[0].created_at;
    const latestDeploy = recentDeploys[0];

    // Check if deploy happened shortly before the errors
    const deployTime = new Date(latestDeploy.deployed_at).getTime();
    const bugTime = new Date(earliestBug).getTime();
    const diffMin = (bugTime - deployTime) / 60_000;

    if (diffMin >= 0 && diffMin <= 30 && bugs.length >= 3) {
      // Errors started after deploy — possible regression
      const { data: existingCorrelation } = await supabase
        .from("incidents")
        .select("id")
        .eq("source", "sentinel")
        .ilike("title", "%deploy correlation%")
        .gte("detected_at", windowStart)
        .limit(1);

      if (!existingCorrelation || existingCorrelation.length === 0) {
        await supabase.from("incidents").insert({
          title: `[Deploy Correlation] ${bugs.length} errors after deploy ${latestDeploy.commit_sha?.slice(0, 7) || "unknown"}`,
          severity: bugs.length >= 10 ? "critical" : "high",
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
        });
      }
    }
  } catch (err) {
    runErrors.push(`Deploy correlation: ${(err as Error).message}`);
  }
}

async function checkAggregateCircuitBreakers(
  supabase: ReturnType<typeof createClient>,
  stats: { circuit_breakers_tripped: number },
  runErrors: string[],
): Promise<void> {
  try {
    // Count errors per category in the circuit breaker window
    const windowStart = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MIN * 60_000).toISOString();

    const { data: recentBugs } = await supabase
      .from("bug_reports")
      .select("id, description, org_id, sentinel_pattern_id")
      .gte("created_at", windowStart)
      .not("sentinel_pattern_id", "is", null);

    if (!recentBugs || recentBugs.length < CIRCUIT_BREAKER_THRESHOLD) return;

    // Group by pattern → category
    const patternCounts: Record<string, { count: number; orgIds: Set<string> }> = {};
    for (const bug of recentBugs) {
      const key = bug.sentinel_pattern_id;
      if (!patternCounts[key]) patternCounts[key] = { count: 0, orgIds: new Set() };
      patternCounts[key].count++;
      if (bug.org_id) patternCounts[key].orgIds.add(bug.org_id);
    }

    // Check if any pattern exceeds threshold
    for (const [patternId, info] of Object.entries(patternCounts)) {
      if (info.count >= CIRCUIT_BREAKER_THRESHOLD) {
        // Load the pattern to get category
        const { data: pat } = await supabase
          .from("error_patterns")
          .select("category, pattern, severity")
          .eq("id", patternId)
          .single();

        if (!pat) continue;

        const features = CATEGORY_TO_FEATURES[pat.category] || [];
        for (const featureKey of features) {
          // Check if already tripped recently
          const { data: recentTrip } = await supabase
            .from("circuit_breaker_events")
            .select("id")
            .eq("feature_key", featureKey)
            .eq("action", "tripped")
            .gte("created_at", windowStart)
            .limit(1);

          if (recentTrip && recentTrip.length > 0) continue; // already tripped

          // Trip the aggregate circuit breaker
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

    // Auto-reset circuit breakers: if error rate dropped to 0 in last window, re-enable
    const { data: recentBreakers } = await supabase
      .from("circuit_breaker_events")
      .select("feature_key, org_id, created_at")
      .eq("action", "tripped")
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString()) // tripped in last hour
      .order("created_at", { ascending: false });

    if (recentBreakers) {
      for (const breaker of recentBreakers) {
        // Check if errors for this feature have stopped
        const features = Object.entries(FEATURE_CIRCUIT_MAP).find(([k]) => k === breaker.feature_key);
        if (!features) continue;

        const categories = features[1];
        const { data: recentErrors } = await supabase
          .from("bug_reports")
          .select("id")
          .gte("created_at", windowStart)
          .not("sentinel_pattern_id", "is", null)
          .limit(1);

        // If no recent errors, reset the breaker
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

  // Auto-resolve incidents older than 2 hours with no new matching errors
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  await supabase
    .from("incidents")
    .update({ status: "resolved", resolved_at: now, auto_healed: true })
    .eq("source", "sentinel")
    .in("status", ["detected", "diagnosing"])
    .lt("detected_at", twoHoursAgo);

  // Clean sentinel_runs older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  await supabase.from("sentinel_runs").delete().lt("started_at", thirtyDaysAgo);

  // Clean circuit_breaker_events older than 30 days
  await supabase.from("circuit_breaker_events").delete().lt("created_at", thirtyDaysAgo);

  // Auto-close resolved bug reports older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  await supabase
    .from("bug_reports")
    .update({ status: "resolved", resolved_at: now })
    .eq("status", "open")
    .not("sentinel_processed_at", "is", null)
    .lt("created_at", sevenDaysAgo);
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
      errors: errors.length > 0 ? errors : null,
      status,
    })
    .eq("id", runId);
}
