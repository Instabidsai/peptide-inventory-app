#!/usr/bin/env node
/**
 * AUTO-HEAL SENTINEL v2 — Full Closed-Loop Error Watcher
 *
 * This script runs continuously in the background. It:
 *   1. Polls the database every 2 minutes for new errors (browser + edge function)
 *   2. Runs health probes every 10 minutes (app URL, DB, critical edge functions)
 *   3. Writes a heartbeat to the DB every cycle so the admin panel can verify it's alive
 *   4. When real errors appear, waits 60s to batch them
 *   5. Triggers the full auto-heal pipeline (detect → CC fix → verify → email)
 *   6. After auto-push, verifies Vercel deployment succeeded
 *   7. Cools down for 15 minutes after each heal run
 *   8. Repeats forever
 *
 * Error sources captured:
 *   - Browser JS errors (auto-error-reporter → bug_reports)
 *   - Browser fetch/API errors (auto-error-reporter → bug_reports)
 *   - Browser React crashes (auto-error-reporter → bug_reports)
 *   - Edge function server-side crashes (withErrorReporting → bug_reports)
 *   - RPC/database errors (auto-error-reporter → bug_reports)
 *   - Health probe failures (sentinel → synthetic bug_reports)
 *   - App/DB/edge function downtime (health probes)
 *
 * Usage:
 *   node scripts/auto-heal-sentinel.mjs              # Run in foreground
 *   node scripts/auto-heal-sentinel.mjs --auto-push  # Also commit+push fixes
 *   start /b node scripts/auto-heal-sentinel.mjs     # Run in background (Windows)
 *
 * Stop: Ctrl+C or kill the process
 *
 * Logs: scripts/reports/sentinel.log
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPORTS_DIR = join(__dirname, "reports");
const LOG_FILE = join(REPORTS_DIR, "sentinel.log");

// ── Config ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 2 * 60 * 1000;     // Check every 2 minutes
const DEBOUNCE_MS = 60 * 1000;               // Wait 60s after first error to batch
const COOLDOWN_MS = 15 * 60 * 1000;          // 15 min cooldown after heal
const MAX_ERRORS_PER_WINDOW = 50;            // Don't process more than 50 at once
const HEALTH_PROBE_EVERY_N_TICKS = 5;        // Run probes every 5th tick (~10 min)
const HEARTBEAT_EVERY_N_TICKS = 3;           // Write heartbeat every 3rd tick (~6 min)

const APP_URL = "https://app.thepeptideai.com";

// Critical edge functions to probe (the ones that handle real user flows)
const CRITICAL_EDGE_FUNCTIONS = [
  "chat-with-ai",
  "send-email",
  "self-signup",
  "provision-tenant",
];

// ── Load .env ─────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const dotEnv = loadEnv();
const SUPABASE_URL = dotEnv.VITE_SUPABASE_URL || dotEnv.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = dotEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = dotEnv.RESEND_API_KEY || process.env.RESEND_API_KEY;
const HEAL_EMAIL = dotEnv.HEAL_EMAIL || process.env.HEAL_EMAIL || "admin@thepeptideai.com";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const flags = new Set(process.argv.slice(2));
const AUTO_PUSH = flags.has("--auto-push");

// ── State ─────────────────────────────────────────────────────────────────
let lastChecked = new Date().toISOString();         // Watermark for audit_log
let lastCheckedBugReports = new Date().toISOString(); // Separate watermark for bug_reports
let healInProgress = false;
let lastHealFinished = 0;                     // Timestamp of last heal completion
let pendingErrors = [];                       // Errors waiting for debounce
let debounceTimer = null;
let tickCount = 0;                            // Cycle counter for health probes

// ── Logging ───────────────────────────────────────────────────────────────
mkdirSync(REPORTS_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toLocaleString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch { /* ignore write errors */ }
}

// ── Noise filters (same as auto-heal.mjs) ────────────────────────────────
function isNoise(record) {
  const d = record.new_data || {};
  const msg = d.message || d.description || "";

  if (msg.includes("self-test ping")) return true;
  if (msg.includes("DialogTitle")) return true;
  if (d.source === "react_boundary" && /\b(Boom|Crash|network error|Loading chunk \d+ failed)\b/.test(msg)) return true;
  if (/Invalid Refresh Token|Refresh Token Not Found|AuthSessionMissingError/i.test(msg)) return true;
  // Only suppress 400s on plain REST (validation), NOT on RPC calls (real bugs)
  if (d.source === "fetch_error" && /HTTP 400/.test(msg) && !/rpc\//.test(msg)) return true;
  if (/ResizeObserver/.test(msg)) return true;
  if (d.source === "fetch_error" && /HTTP 401/.test(msg) && /functions\/v1\//.test(msg)) return true;
  if (d.source === "fetch_error" && /HTTP 409/.test(msg)) return true;  // upsert race conditions
  if (/Auto-protocol generation failed \(non-blocking\)/.test(msg)) return true;
  if (/\[hmr\] Failed to reload/.test(msg)) return true;
  if (record.action === "bug_report" && /^(hey|help|hi|hello)\b/i.test(msg.trim())) return true;
  // Suppress sentinel's own health probe noise
  if (/sentinel_heartbeat|health_probe/.test(msg)) return true;
  return false;
}

// ── Poll for new errors ──────────────────────────────────────────────────
async function pollForErrors() {
  try {
    const { data, error } = await supabase
      .from("audit_log")
      .select("id, action, new_data, created_at, user_id")
      .in("action", ["bug_report", "auto_error"])
      .gt("created_at", lastChecked)
      .order("created_at", { ascending: true })
      .limit(MAX_ERRORS_PER_WINDOW);

    if (error) {
      log(`WARN: Poll query failed: ${error.message}`);
      return [];
    }

    if (!data || data.length === 0) return [];

    lastChecked = data[data.length - 1].created_at;

    const actionable = data.filter((r) => !isNoise(r));

    const seen = new Set();
    const deduped = actionable.filter((r) => {
      const key = (r.new_data?.message || r.new_data?.description || "").slice(0, 100);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped;
  } catch (err) {
    log(`WARN: Poll error: ${err.message}`);
    return [];
  }
}

// Also check bug_reports table (fallback path for auto-error-reporter + edge fn errors)
async function pollBugReports() {
  try {
    const { data, error } = await supabase
      .from("bug_reports")
      .select("id, description, page_url, console_errors, created_at, status")
      .like("description", "[AUTO]%")
      .gt("created_at", lastCheckedBugReports)
      .in("status", ["open", "new"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error || !data || data.length === 0) return [];

    lastCheckedBugReports = data[data.length - 1].created_at;

    return data.filter((r) => {
      const msg = r.description || "";
      if (msg.includes("self-test ping")) return false;
      if (/ResizeObserver/.test(msg)) return false;
      if (/HTTP 401/.test(msg) && /functions\/v1\//.test(msg)) return false;
      if (/HTTP 400/.test(msg) && /rest\/v1\//.test(msg) && !/rpc\//.test(msg)) return false;
      if (/HTTP 409/.test(msg)) return false;  // upsert race conditions
      if (/Auto-protocol generation failed \(non-blocking\)/.test(msg)) return false;
      if (/\[hmr\] Failed to reload/.test(msg)) return false;
      if (/sentinel_heartbeat|health_probe/.test(msg)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── HEARTBEAT — Proves the sentinel is alive ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
async function writeHeartbeat() {
  try {
    const now = new Date().toISOString();
    // Upsert into audit_log with a known sentinel_heartbeat action
    await supabase.from("audit_log").insert({
      action: "sentinel_heartbeat",
      new_data: {
        status: healInProgress ? "healing" : "watching",
        tick: tickCount,
        last_heal: lastHealFinished ? new Date(lastHealFinished).toISOString() : null,
        pending_errors: pendingErrors.length,
        uptime_minutes: Math.round((Date.now() - startedAt) / 60000),
      },
    });
  } catch {
    // Non-critical — don't log to avoid noise
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── HEALTH PROBES — Detect infrastructure-level failures ─────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Probe the live app URL — if it's down, users can't access the platform.
 */
async function probeAppUrl() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(APP_URL, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, error: `App returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `App unreachable: ${err.message}` };
  }
}

/**
 * Probe the database with a simple query.
 */
async function probeDatabase() {
  try {
    const start = Date.now();
    const { error } = await supabase
      .from("organizations")
      .select("id")
      .limit(1);
    const latency = Date.now() - start;

    if (error) {
      return { ok: false, error: `DB query failed: ${error.message}`, latency };
    }
    if (latency > 10000) {
      return { ok: false, error: `DB query slow: ${latency}ms`, latency };
    }
    return { ok: true, latency };
  } catch (err) {
    return { ok: false, error: `DB unreachable: ${err.message}` };
  }
}

/**
 * Probe critical edge functions via their health check endpoint.
 * (Our _shared/auth.ts exports handleHealthCheck which responds to GET /?health=1)
 */
async function probeEdgeFunctions() {
  const results = [];

  for (const fn of CRITICAL_EDGE_FUNCTIONS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const url = `${SUPABASE_URL}/functions/v1/${fn}`;
      const res = await fetch(url, {
        method: "OPTIONS",
        signal: controller.signal,
        headers: { "apikey": SUPABASE_KEY },
      });
      clearTimeout(timeout);

      // OPTIONS should return 200 (CORS preflight). Anything else = problem.
      if (res.status >= 500) {
        results.push({ fn, ok: false, error: `${fn} returned HTTP ${res.status}` });
      } else {
        results.push({ fn, ok: true });
      }
    } catch (err) {
      results.push({ fn, ok: false, error: `${fn} unreachable: ${err.message}` });
    }
  }

  return results;
}

/**
 * Run all health probes and inject synthetic errors for failures.
 */
async function runHealthProbes() {
  log("PROBING: Running health checks...");
  const failures = [];

  // 1. App URL
  const appResult = await probeAppUrl();
  if (!appResult.ok) {
    log(`  PROBE FAIL: App — ${appResult.error}`);
    failures.push(`App down: ${appResult.error}`);
  } else {
    log("  PROBE OK: App responding");
  }

  // 2. Database
  const dbResult = await probeDatabase();
  if (!dbResult.ok) {
    log(`  PROBE FAIL: DB — ${dbResult.error}`);
    failures.push(`Database: ${dbResult.error}`);
  } else {
    log(`  PROBE OK: DB (${dbResult.latency}ms)`);
  }

  // 3. Edge functions
  const efResults = await probeEdgeFunctions();
  for (const r of efResults) {
    if (!r.ok) {
      log(`  PROBE FAIL: ${r.fn} — ${r.error}`);
      failures.push(`Edge function ${r.fn}: ${r.error}`);
    }
  }
  const efOk = efResults.filter((r) => r.ok).length;
  if (efOk > 0) log(`  PROBE OK: ${efOk}/${efResults.length} edge functions`);

  // Inject failures as synthetic errors
  if (failures.length > 0) {
    log(`  PROBE: ${failures.length} failure(s) — injecting as errors`);
    for (const msg of failures) {
      try {
        await supabase.from("bug_reports").insert({
          description: `[AUTO] health_probe_failure: ${msg}`,
          page_url: "sentinel://health-probe",
          status: "open",
          console_errors: JSON.stringify([{
            source: "health_probe",
            error: msg,
            timestamp: new Date().toISOString(),
          }]),
        });
      } catch { /* swallow */ }
    }
  } else {
    log("  PROBES: All systems healthy");
  }

  return failures;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── DEPLOY VERIFICATION — Check Vercel after push ────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * After auto-heal pushes code, check if the Vercel deployment succeeded.
 * Sends an alert email if deployment failed.
 */
async function verifyDeployAfterPush() {
  // Only relevant if auto-push is enabled
  if (!AUTO_PUSH) return;

  log("DEPLOY CHECK: Waiting 90s for Vercel build...");
  await new Promise((r) => setTimeout(r, 90000));

  try {
    // Check the app is still responding after deploy
    const result = await probeAppUrl();
    if (!result.ok) {
      log(`DEPLOY CHECK FAIL: App down after push — ${result.error}`);
      // Send emergency alert
      if (RESEND_API_KEY) {
        await sendAlertEmail(
          "DEPLOY FAILURE: Auto-heal push may have broken the app",
          `The auto-heal sentinel pushed code to Vercel, but the app is now unreachable.\n\nError: ${result.error}\n\nCheck Vercel dashboard immediately.`
        );
      }
    } else {
      log("DEPLOY CHECK OK: App responding after push");
    }
  } catch (err) {
    log(`DEPLOY CHECK ERROR: ${err.message}`);
  }
}

/**
 * Send an alert email via Resend for critical infrastructure issues.
 */
async function sendAlertEmail(subject, body) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peptide Portal Auto-Heal <noreply@thepeptideai.com>",
        to: [HEAL_EMAIL],
        subject: `[ALERT] ${subject}`,
        html: `<div style="font-family:sans-serif;padding:20px;background:#fee2e2;border:2px solid #dc2626;border-radius:8px;">
          <h2 style="color:#dc2626;margin-top:0;">Infrastructure Alert</h2>
          <pre style="background:#fff;padding:16px;border-radius:4px;overflow-x:auto;">${body}</pre>
          <p style="color:#666;font-size:12px;">Sent by Auto-Heal Sentinel at ${new Date().toLocaleString()}</p>
        </div>`,
      }),
    });
    if (res.ok) {
      log(`  Alert email sent to ${HEAL_EMAIL}`);
    } else {
      log(`  Alert email failed: HTTP ${res.status}`);
    }
  } catch (err) {
    log(`  Alert email error: ${err.message}`);
  }
}

// ── Trigger auto-heal ────────────────────────────────────────────────────
async function triggerHeal(errorSummary) {
  if (healInProgress) {
    log("Heal already in progress — skipping");
    return;
  }

  healInProgress = true;
  const errorCount = errorSummary.length;
  log(`HEALING: Triggering auto-heal for ${errorCount} new error(s)`);

  // Log what triggered it
  for (const err of errorSummary.slice(0, 5)) {
    const msg = err.new_data?.message || err.new_data?.description || err.description || "unknown";
    log(`  -> ${msg.slice(0, 120)}`);
  }
  if (errorCount > 5) log(`  ... and ${errorCount - 5} more`);

  try {
    const healArgs = AUTO_PUSH ? "--auto-push" : "";
    const cmd = `node scripts/auto-heal.mjs ${healArgs}`;

    // Strip CLAUDECODE env vars so CC can spawn fresh
    const { CLAUDECODE: _, CLAUDE_CODE_ENTRYPOINT: _b, ...cleanEnv } = process.env;

    log(`Running: ${cmd}`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      shell: true,
      timeout: 720_000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...cleanEnv, FORCE_COLOR: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`HEALED: Auto-heal completed in ${elapsed}s`);

    // Log key lines from output
    const lines = output.split("\n").filter(Boolean);
    const summaryLine = lines.find((l) => l.includes("Issues found:")) || "";
    const tscLine = lines.find((l) => l.includes("Post-fix tsc:")) || "";
    const testLine = lines.find((l) => l.includes("Post-fix tests:")) || "";
    const emailLine = lines.find((l) => l.includes("Email sent") || l.includes("Email failed") || l.includes("skipping email")) || "";
    const pushLine = lines.find((l) => l.includes("Pushed to") || l.includes("Skipping push")) || "";
    if (summaryLine) log(`  ${summaryLine.trim()}`);
    if (tscLine) log(`  ${tscLine.trim()}`);
    if (testLine) log(`  ${testLine.trim()}`);
    if (emailLine) log(`  ${emailLine.trim()}`);
    if (pushLine) log(`  ${pushLine.trim()}`);

    // If we pushed, verify deploy
    if (pushLine.includes("Pushed to")) {
      verifyDeployAfterPush();
    }

  } catch (err) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    log(`HEAL FAILED: ${err.message?.slice(0, 200)}`);

    const lines = output.split("\n").filter(Boolean);
    const summaryLine = lines.find((l) => l.includes("Issues found:")) || "";
    if (summaryLine) log(`  ${summaryLine.trim()}`);
  } finally {
    healInProgress = false;
    lastHealFinished = Date.now();
    pendingErrors = [];
  }
}

// ── Main loop ────────────────────────────────────────────────────────────
async function tick() {
  tickCount++;

  // Skip if currently healing
  if (healInProgress) return;

  // Skip if in cooldown
  const cooldownRemaining = COOLDOWN_MS - (Date.now() - lastHealFinished);
  if (lastHealFinished > 0 && cooldownRemaining > 0) {
    return;
  }

  // Heartbeat — write to DB every N ticks to prove we're alive
  if (tickCount % HEARTBEAT_EVERY_N_TICKS === 0) {
    await writeHeartbeat();
  }

  // Health probes — run every N ticks
  if (tickCount % HEALTH_PROBE_EVERY_N_TICKS === 0) {
    await runHealthProbes();
  }

  // Poll both error sources
  const auditErrors = await pollForErrors();
  const bugReportErrors = await pollBugReports();
  const newErrors = [...auditErrors, ...bugReportErrors];

  if (newErrors.length === 0) return;

  log(`DETECTED: ${newErrors.length} new error(s) — starting ${DEBOUNCE_MS / 1000}s debounce window`);
  pendingErrors.push(...newErrors);

  // Debounce: wait before triggering to batch rapid errors
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    triggerHeal(pendingErrors);
  }, DEBOUNCE_MS);
}

// ── Startup ──────────────────────────────────────────────────────────────
const startedAt = Date.now();

log("════════════════════════════════════════════════");
log("AUTO-HEAL SENTINEL v2 — FULL CLOSED LOOP");
log("════════════════════════════════════════════════");
log(`  Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
log(`  Debounce: ${DEBOUNCE_MS / 1000}s`);
log(`  Cooldown after heal: ${COOLDOWN_MS / 60000} min`);
log(`  Health probes: every ${HEALTH_PROBE_EVERY_N_TICKS * POLL_INTERVAL_MS / 60000} min`);
log(`  Heartbeat: every ${HEARTBEAT_EVERY_N_TICKS * POLL_INTERVAL_MS / 60000} min`);
log(`  Auto-push: ${AUTO_PUSH ? "YES" : "NO"}`);
log(`  App URL: ${APP_URL}`);
log(`  Supabase: ${SUPABASE_URL}`);
log(`  Log file: ${LOG_FILE}`);
log("────────────────────────────────────────────────");
log("Error sources monitored:");
log("  [1] Browser JS errors (auto-error-reporter)");
log("  [2] Browser fetch/API errors (auto-error-reporter)");
log("  [3] React render crashes (auto-error-reporter)");
log("  [4] Edge function server crashes (withErrorReporting)");
log("  [5] RPC/database errors (auto-error-reporter)");
log("  [6] App downtime (health probe)");
log("  [7] Database failures (health probe)");
log("  [8] Edge function downtime (health probe)");
log("  [9] Vercel deploy failures (post-push check)");
log("════════════════════════════════════════════════");
log("Watching for errors... (Ctrl+C to stop)");

// Run initial health probe on startup to verify everything is working
runHealthProbes().then(() => {
  writeHeartbeat();
  log("Initial health check complete. Entering watch loop.");
});

// Then regular polling
const interval = setInterval(tick, POLL_INTERVAL_MS);

// Graceful shutdown
function shutdown() {
  log("SENTINEL STOPPING — graceful shutdown");
  clearInterval(interval);
  if (debounceTimer) clearTimeout(debounceTimer);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep alive
process.stdin.resume();
