#!/usr/bin/env node
/**
 * AUTO-HEAL SENTINEL — Always-On Error Watcher
 *
 * This script runs continuously in the background. It:
 *   1. Polls the database every 2 minutes for new errors
 *   2. When real errors appear, waits 60s to batch them
 *   3. Triggers the full auto-heal pipeline (detect → CC fix → verify → email)
 *   4. Cools down for 15 minutes after each heal run
 *   5. Repeats forever
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
  if (d.source === "fetch_error" && /HTTP 400/.test(msg)) return true;
  if (/ResizeObserver/.test(msg)) return true;
  if (d.source === "fetch_error" && /HTTP 401/.test(msg) && /functions\/v1\//.test(msg)) return true;
  if (/Auto-protocol generation failed \(non-blocking\)/.test(msg)) return true;
  if (/\[hmr\] Failed to reload/.test(msg)) return true; // dev-only HMR, resolved by page refresh
  if (record.action === "bug_report" && /^(hey|help|hi|hello)\b/i.test(msg.trim())) return true;
  return false;
}

// ── Poll for new errors ──────────────────────────────────────────────────
async function pollForErrors() {
  try {
    // Query audit_log for new auto_error and bug_report entries since last check
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

    // Update watermark to latest error we've seen
    lastChecked = data[data.length - 1].created_at;

    // Filter noise
    const actionable = data.filter((r) => !isNoise(r));

    // Deduplicate by message
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

// Also check bug_reports table (fallback path for auto-error-reporter)
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

    // Advance bug_reports watermark so we don't re-poll the same entries
    lastCheckedBugReports = data[data.length - 1].created_at;

    return data.filter((r) => {
      const msg = r.description || "";
      if (msg.includes("self-test ping")) return false;
      if (/ResizeObserver/.test(msg)) return false;
      if (/HTTP 401/.test(msg) && /functions\/v1\//.test(msg)) return false;
      if (/HTTP 400/.test(msg) && /rest\/v1\//.test(msg)) return false;
      if (/Auto-protocol generation failed \(non-blocking\)/.test(msg)) return false;
      if (/\[hmr\] Failed to reload/.test(msg)) return false;
      return true;
    });
  } catch {
    return [];
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
    // Build the auto-heal command
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
      timeout: 720_000, // 12 minutes (heal has 10min CC timeout + overhead)
      maxBuffer: 20 * 1024 * 1024,
      env: { ...cleanEnv, FORCE_COLOR: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`HEALED: Auto-heal completed in ${elapsed}s`);

    // Log tail of output
    const lines = output.split("\n").filter(Boolean);
    const summaryLine = lines.find((l) => l.includes("Issues found:")) || "";
    const tscLine = lines.find((l) => l.includes("Post-fix tsc:")) || "";
    const testLine = lines.find((l) => l.includes("Post-fix tests:")) || "";
    if (summaryLine) log(`  ${summaryLine.trim()}`);
    if (tscLine) log(`  ${tscLine.trim()}`);
    if (testLine) log(`  ${testLine.trim()}`);

  } catch (err) {
    const elapsed = ((Date.now() - Date.now()) / 1000).toFixed(1);
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    log(`HEAL FAILED: ${err.message?.slice(0, 200)}`);

    // Still log summary if available
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
  // Skip if currently healing
  if (healInProgress) return;

  // Skip if in cooldown
  const cooldownRemaining = COOLDOWN_MS - (Date.now() - lastHealFinished);
  if (lastHealFinished > 0 && cooldownRemaining > 0) {
    // Only log every 5th tick during cooldown to reduce noise
    return;
  }

  // Poll both sources
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
log("========================================");
log("AUTO-HEAL SENTINEL STARTED");
log(`  Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
log(`  Debounce: ${DEBOUNCE_MS / 1000}s`);
log(`  Cooldown after heal: ${COOLDOWN_MS / 60000} min`);
log(`  Auto-push: ${AUTO_PUSH ? "YES" : "NO"}`);
log(`  Supabase: ${SUPABASE_URL}`);
log(`  Log file: ${LOG_FILE}`);
log("========================================");
log("Watching for errors... (Ctrl+C to stop)");

// Initial tick immediately, then on interval
tick();
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
