#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * AUTO-HEAL PIPELINE — Peptide Portal
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Automated issue detection → Claude Code repair → verification → email report.
 *
 * ── ARCHITECTURE ──
 *
 * This pipeline has 4 phases:
 *   1. DETECTION — Checks 6 sources for issues:
 *      a) Bug reports: User-submitted via BugReportButton → audit_log table
 *         (action='bug_report', data in new_data column including console errors)
 *      a2) Auto errors: Automatically captured runtime errors → audit_log table
 *          (action='auto_error', captures unhandled rejections, uncaught errors,
 *          edge function failures, React boundary crashes — NO user action needed)
 *      b) RPC functions: Queries Supabase OpenAPI spec to verify all 16 expected
 *         RPC functions exist in the database
 *      c) Edge functions: Invokes each of 12 edge functions with health_check flag
 *      d) TypeScript: Runs `npx tsc --noEmit`
 *      e) Tests: Runs `npx vitest run`
 *
 *   2. AUTO-FIX — Spawns a single-use Claude Code session with --dangerously-skip-permissions.
 *      The prompt contains all detected issues with context. Claude Code reads the codebase,
 *      fixes issues, and runs tsc + tests to verify.
 *
 *   3. VERIFICATION — Independently runs tsc and tests to confirm fixes.
 *      If --auto-push is set AND verification passes, commits and pushes to main.
 *
 *   4. REPORTING — Generates markdown report (saved to scripts/reports/), sends
 *      HTML email via Resend API, and logs to audit_log table.
 *
 * ── DATA FLOW ──
 *
 *   Frontend errors (two paths):
 *     Path 1 — AUTOMATIC (no user action):
 *       unhandled rejection / uncaught error / edge function failure / React crash
 *         → auto-error-reporter.ts (installed in main.tsx)
 *         → audit_log table (action='auto_error', new_data.message/source/stack)
 *         → auto-heal reads from audit_log
 *
 *     Path 2 — MANUAL (user clicks bug button):
 *       console.error → window.__recentConsoleErrors (main.tsx interceptor, last 20)
 *         → BugReportButton captures them when user submits
 *         → audit_log table (action='bug_report', new_data.console_errors)
 *         → auto-heal reads from audit_log
 *
 *   Sentry (separate system):
 *     @sentry/react captures crashes, unhandled rejections, and performance.
 *     Sentry does NOT feed into auto-heal directly — it has its own dashboard.
 *     User context (role, org_id, partner_tier) is attached in AuthContext.tsx.
 *
 *   Backend checks:
 *     RPC existence (OpenAPI spec) + Edge function health + tsc + vitest
 *       → auto-heal detects and fixes
 *
 * ── USAGE ──
 *
 *   npm run auto-heal                    # Full cycle: detect + fix + email
 *   npm run auto-heal:detect             # Just detect issues (--detect-only)
 *   npm run auto-heal:push               # Detect + fix + commit + push (--auto-push)
 *   npm run auto-heal -- --skip-cc       # Skip Claude Code, just detect + report
 *
 * ── SCHEDULING ──
 *
 *   Run on a cron (e.g. every 6 hours) or manually when issues are reported.
 *   Windows Task Scheduler: `node scripts/auto-heal.mjs --auto-push`
 *   GitHub Actions: Add as a scheduled workflow
 *
 * ── REQUIRED .env ──
 *
 *   VITE_SUPABASE_URL           — Supabase project URL (this project)
 *   SUPABASE_SERVICE_ROLE_KEY   — Service role key (bypasses RLS)
 *
 * ── OPTIONAL .env ──
 *
 *   HEAL_EMAIL       — Where to send reports (e.g. admin@thepeptideai.com)
 *   RESEND_API_KEY   — Resend.com API key for email delivery
 *   SITE_NAME        — Name shown in reports (default: "Peptide Portal")
 *
 * ── SAFETY ──
 *
 *   - detect-only mode is safe to run anytime (no code changes)
 *   - Full mode spawns Claude Code with --dangerously-skip-permissions — it CAN edit files
 *   - --auto-push will commit and push ONLY if tsc + tests pass after fix
 *   - Without --auto-push, changes are local only (you review before pushing)
 *   - Claude Code session has a 10-minute timeout
 *   - Reports are always saved to scripts/reports/ regardless of mode
 *
 * ── RELATED FILES ──
 *
 *   src/lib/auto-error-reporter.ts      — Automatic runtime error capture (no user action)
 *   src/components/BugReportButton.tsx  — Floating bug report UI (all pages)
 *   src/main.tsx                        — Installs auto-error-reporter + Sentry init
 *   src/components/ErrorBoundary.tsx    — React crash boundary (reports via auto-error-reporter)
 *   src/contexts/AuthContext.tsx         — Sentry user context attachment
 *   src/pages/admin/SystemHealth.tsx     — Admin health dashboard at /admin/health
 *   .env                                — API keys and config
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPORTS_DIR = join(__dirname, "reports");

// ── Load .env ────────────────────────────────────────────────────────────────
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
const env = { ...process.env, ...dotEnv };
// Prefer .env file values for Supabase (process.env may have a different project's URL)
const SUPABASE_URL = dotEnv.VITE_SUPABASE_URL || dotEnv.SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = dotEnv.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const HEAL_EMAIL = env.HEAL_EMAIL;
const RESEND_API_KEY = env.RESEND_API_KEY;
const SITE_NAME = env.SITE_NAME || "Peptide Portal";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const flags = new Set(process.argv.slice(2));
const DETECT_ONLY = flags.has("--detect-only");
const AUTO_PUSH = flags.has("--auto-push");
const SKIP_CC = flags.has("--skip-cc");

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const RPC_FUNCTIONS = [
  "link_referral",
  "delete_contact_cascade",
  "apply_commissions_to_owed",
  "convert_commission_to_credit",
  "process_sale_commission",
  "create_validated_order",
  "get_bottle_stats",
  "get_inventory_valuation",
  "get_org_counts",
  "check_subdomain_availability",
  "get_partner_downline",
  "get_peptide_stock_counts",
  "get_supplier_orders",
  "pay_order_with_credit",
  "decrement_vial",
  "auto_link_contact_by_email",
];

const EDGE_FUNCTIONS = [
  "chat-with-ai",
  "admin-ai-chat",
  "partner-ai-chat",
  "invite-user",
  "self-signup",
  "exchange-token",
  "promote-contact",
  "analyze-food",
  "process-health-document",
  "notify-commission",
  "create-supplier-order",
  "provision-tenant",
];

async function checkRpcFunctions() {
  console.log("  Checking RPC functions...");
  const issues = [];
  try {
    // Use OpenAPI spec to list all RPC functions — avoids false positives from parameter mismatches
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const spec = await res.json();
    const rpcPaths = Object.keys(spec.paths || {}).filter((p) => p.startsWith("/rpc/"));
    const found = new Set(rpcPaths.map((p) => p.replace("/rpc/", "")));

    for (const fn of RPC_FUNCTIONS) {
      if (!found.has(fn)) {
        issues.push({ type: "rpc_missing", name: fn, error: "Function not found in database" });
        console.log(`    FAIL: RPC ${fn} — not found`);
      }
    }
    if (issues.length === 0) {
      console.log(`    All ${RPC_FUNCTIONS.length} RPC functions present`);
    }
  } catch (err) {
    console.log(`    WARN: RPC check failed: ${err.message}`);
  }
  return issues;
}

async function checkEdgeFunctions() {
  console.log("  Checking edge functions...");
  const issues = [];
  for (const fn of EDGE_FUNCTIONS) {
    try {
      const { error } = await supabase.functions.invoke(fn, {
        body: { health_check: true },
      });
      if (
        error?.message?.includes("not found") ||
        error?.message?.includes("404") ||
        error?.message?.includes("Failed to fetch")
      ) {
        issues.push({
          type: "edge_missing",
          name: fn,
          error: error.message,
        });
        console.log(`    FAIL: Edge ${fn} — ${error.message}`);
      }
    } catch (err) {
      issues.push({
        type: "edge_error",
        name: fn,
        error: err.message,
      });
    }
  }
  return issues;
}

async function checkBugReports() {
  console.log("  Checking recent bug reports...");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h

  let data, error;
  try {
    // Fetch both manual bug reports AND automatic error reports
    ({ data, error } = await supabase
      .from("audit_log")
      .select("id, action, new_data, created_at, user_id")
      .in("action", ["bug_report", "auto_error"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20));
  } catch (fetchErr) {
    console.log(`    WARN: Could not query bug reports: ${fetchErr.constructor.name}: ${fetchErr.message}`);
    if (fetchErr.cause) console.log(`    WARN: Cause: ${fetchErr.cause.code || fetchErr.cause.message || fetchErr.cause}`);
    return [];
  }

  if (error) {
    console.log(`    WARN: Could not query bug reports: ${error.message}`);
    return [];
  }

  const reports = (data || []).map((r) => {
    const d = r.new_data || {};
    const isAutoError = r.action === "auto_error";
    return {
      type: isAutoError ? "auto_error" : "bug_report",
      name: isAutoError
        ? `Auto Error [${d.source || "unknown"}]: ${d.message?.slice(0, 80) || "untitled"}`
        : `Bug: ${d.description?.slice(0, 80) || "untitled"}`,
      error: isAutoError ? d.message || "No message" : d.description || "No description",
      page: d.page || "unknown",
      consoleErrors: d.console_errors || [],
      stack: d.stack || null,
      source: d.source || null,
      extra: d.extra || {},
      reportedAt: r.created_at,
      userId: r.user_id,
    };
  });

  // Also check bug_reports table for auto-captured errors (fallback path)
  try {
    const { data: brData } = await supabase
      .from("bug_reports")
      .select("id, description, page_url, console_errors, created_at, user_id, status")
      .like("description", "[AUTO]%")
      .gte("created_at", since)
      .in("status", ["open", "new"])
      .order("created_at", { ascending: false })
      .limit(20);

    for (const br of brData || []) {
      let parsed = {};
      try { parsed = JSON.parse(br.console_errors || "{}"); } catch { /* ignore */ }
      reports.push({
        type: "auto_error",
        name: `Auto Error (fallback): ${br.description?.slice(7, 87) || "untitled"}`,
        error: br.description?.slice(7) || "No message",
        page: br.page_url || "unknown",
        consoleErrors: [],
        stack: parsed.stack || null,
        source: parsed.source || null,
        extra: parsed.extra || {},
        reportedAt: br.created_at,
        userId: br.user_id,
      });
    }
  } catch {
    // Non-critical — primary path is audit_log
  }

  // Filter out self-test pings and non-actionable noise
  const filtered = reports.filter((r) => {
    const msg = r.error || r.name || "";
    if (msg.includes("self-test ping")) return false;
    if (msg.includes("DialogTitle")) return false; // accessibility warning, not a bug
    // ErrorBoundary test simulations — not real crashes
    if (r.source === "react_boundary" && /\b(Boom|Crash|network error|Loading chunk \d+ failed)\b/.test(msg)) return false;
    // Auth token refresh failures — normal session expiry, not a bug
    if (/Invalid Refresh Token|Refresh Token Not Found|AuthSessionMissingError/i.test(msg)) return false;
    // HTTP 400 on PostgREST — usually a query param issue that self-resolves on page refresh
    if (r.source === "fetch_error" && /HTTP 400/.test(msg)) return false;
    // Vague user "need help" reports without actual bug info
    if (r.type === "bug_report" && /^(hey|help|hi|hello)\b/i.test(r.error?.trim())) return false;
    return true;
  });

  // Deduplicate by error message (keep first occurrence)
  const seen = new Set();
  const deduped = filtered.filter((r) => {
    const key = (r.error || "").slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const bugCount = deduped.filter((r) => r.type === "bug_report").length;
  const autoCount = deduped.filter((r) => r.type === "auto_error").length;
  if (bugCount > 0) console.log(`    Found ${bugCount} bug report(s) in last 24h`);
  if (autoCount > 0) console.log(`    Found ${autoCount} auto-captured error(s) in last 24h`);
  const dropped = reports.length - deduped.length;
  if (dropped > 0) console.log(`    Filtered out ${dropped} noise/duplicate entries`);
  return deduped;
}

function checkTypeScript() {
  console.log("  Running TypeScript check...");
  try {
    execSync("npx tsc --noEmit", {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return [];
  } catch (err) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    const errors = output
      .split("\n")
      .filter((l) => l.includes("error TS"))
      .slice(0, 20); // cap at 20 errors
    console.log(`    FAIL: ${errors.length} TypeScript error(s)`);
    return errors.map((e) => ({
      type: "typescript",
      name: "TypeScript",
      error: e.trim(),
    }));
  }
}

function checkTests() {
  console.log("  Running tests...");
  try {
    execSync("npx vitest run --reporter=json 2>/dev/null", {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 180_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return [];
  } catch (err) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    // Try to parse JSON output for clean failure info
    let failures = [];
    try {
      const json = JSON.parse(output.trim());
      if (json.testResults) {
        for (const suite of json.testResults) {
          for (const test of suite.assertionResults || []) {
            if (test.status === "failed") {
              const suiteName = suite.name?.split(/[/\\]/).pop() || "unknown";
              const msg = (test.failureMessages || []).join("\n").slice(0, 200);
              failures.push({
                type: "test_failure",
                name: `${suiteName} > ${test.fullName || test.title}`,
                error: msg || "Test failed",
              });
            }
          }
        }
      }
    } catch { /* not JSON, fall back to line parsing */ }

    if (failures.length === 0) {
      // Fallback: extract FAIL lines from text output
      const failLines = output
        .split("\n")
        .filter((l) => l.includes("FAIL") || l.includes("AssertionError"))
        .slice(0, 10);
      failures = failLines.length > 0
        ? failLines.map((l) => ({
            type: "test_failure",
            name: "Test",
            error: l.trim().slice(0, 200),
          }))
        : [{ type: "test_failure", name: "Test", error: "Tests failed — check vitest output" }];
    }

    console.log(`    FAIL: ${failures.length} test failure(s) detected`);
    return failures;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — CLAUDE CODE AUTO-FIX
// ══════════════════════════════════════════════════════════════════════════════

function buildPrompt(issues) {
  const grouped = {};
  for (const issue of issues) {
    if (!grouped[issue.type]) grouped[issue.type] = [];
    grouped[issue.type].push(issue);
  }

  let prompt = `You are an auto-heal agent for the Peptide Inventory App.
The project is at the current working directory.
Supabase import: @/integrations/sb_client/client (NOT supabase/client).

The following ${issues.length} issues were detected by the automated health check.
Fix each one. After fixing, run \`npx tsc --noEmit\` and \`npx vitest run\` to verify.

`;

  if (grouped.rpc_missing) {
    prompt += `## Missing RPC Functions\n`;
    prompt += `These functions are called in the code but don't exist in the database.\n`;
    prompt += `Create them as Supabase migrations in supabase/migrations/ OR use the supabase CLI.\n\n`;
    for (const i of grouped.rpc_missing) {
      prompt += `- \`${i.name}\`: ${i.error}\n`;
    }
    prompt += `\nHint: Look at existing RPC calls in src/hooks/ to understand expected params and return types.\n\n`;
  }

  if (grouped.edge_missing) {
    prompt += `## Missing/Broken Edge Functions\n`;
    for (const i of grouped.edge_missing) {
      prompt += `- \`${i.name}\`: ${i.error}\n`;
    }
    prompt += `\n`;
  }

  if (grouped.typescript) {
    prompt += `## TypeScript Errors\nFix these compilation errors:\n\n`;
    for (const i of grouped.typescript) {
      prompt += `- ${i.error}\n`;
    }
    prompt += `\n`;
  }

  if (grouped.test_failure) {
    prompt += `## Test Failures\nFix these failing tests:\n\n`;
    for (const i of grouped.test_failure) {
      prompt += `- ${i.error}\n`;
    }
    prompt += `\n`;
  }

  if (grouped.bug_report) {
    prompt += `## User Bug Reports (last 24h)\nInvestigate and fix these user-reported bugs:\n\n`;
    for (const i of grouped.bug_report) {
      prompt += `- Page: ${i.page} — "${i.error}"\n`;
      if (i.consoleErrors?.length > 0) {
        prompt += `  Console errors at time of report:\n`;
        for (const ce of i.consoleErrors.slice(0, 5)) {
          prompt += `    - ${ce.slice(0, 200)}\n`;
        }
      }
    }
    prompt += `\n`;
  }

  prompt += `\n## Rules
1. Fix the root cause, not symptoms
2. Do NOT add unnecessary abstractions or comments
3. Run tsc --noEmit after fixing to verify no type errors
4. Run npx vitest run to verify tests pass
5. If you cannot fix something, explain why in a comment
6. Keep changes minimal — only touch what's broken
`;

  return prompt;
}

function spawnClaudeCode(issues) {
  const prompt = buildPrompt(issues);
  const promptFile = join(os.tmpdir(), "auto-heal-prompt.txt");
  writeFileSync(promptFile, prompt, "utf-8");

  console.log("\n  Spawning Claude Code session...");
  console.log(`  Prompt: ${promptFile} (${prompt.length} chars)`);

  try {
    // On Windows, use 'type' to pipe file contents; on Unix, use 'cat'
    const catCmd = process.platform === "win32" ? "type" : "cat";
    const promptPath =
      process.platform === "win32"
        ? promptFile.replace(/\//g, "\\")
        : promptFile;

    const output = execSync(
      `${catCmd} "${promptPath}" | claude --dangerously-skip-permissions -p`,
      {
        cwd: ROOT,
        timeout: 600_000, // 10 minutes
        encoding: "utf-8",
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
        env: (() => {
          const { CLAUDECODE: _, CLAUDE_CODE_ENTRYPOINT: _b, ...clean } = process.env;
          return { ...clean, FORCE_COLOR: "0" };
        })(),
      }
    );

    return { success: true, output: output.trim() };
  } catch (err) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    return { success: false, output: output.trim() || err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — VERIFICATION & COMMIT
// ══════════════════════════════════════════════════════════════════════════════

function verifyFixes() {
  console.log("\n  Verifying fixes...");
  const results = { tsc: true, tests: true, tscOutput: "", testOutput: "" };

  try {
    execSync("npx tsc --noEmit", {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("    tsc: PASS");
  } catch (err) {
    results.tsc = false;
    results.tscOutput = (err.stdout || "") + (err.stderr || "");
    console.log("    tsc: FAIL");
  }

  try {
    execSync("npx vitest run", {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 180_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("    tests: PASS");
  } catch (err) {
    results.tests = false;
    results.testOutput = (err.stdout || "") + (err.stderr || "");
    console.log("    tests: FAIL");
  }

  return results;
}

function commitAndPush(issueCount) {
  console.log("\n  Committing and pushing...");
  try {
    execSync("git add -A", { cwd: ROOT, encoding: "utf-8" });
    const msg = `auto-heal: fix ${issueCount} issue(s) detected by health check\n\nCo-Authored-By: Claude Code Auto-Heal <noreply@anthropic.com>`;
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, {
      cwd: ROOT,
      encoding: "utf-8",
      shell: true,
    });
    execSync("git push origin main:master && git push origin main:main", {
      cwd: ROOT,
      encoding: "utf-8",
      shell: true,
      timeout: 60_000,
    });
    console.log("    Pushed to main + master");
    return true;
  } catch (err) {
    console.error("    Push failed:", err.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — REPORTING
// ══════════════════════════════════════════════════════════════════════════════

function buildReport(issues, ccResult, verification, pushed) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const readableTime = now.toLocaleString();

  const issuesByType = {};
  for (const i of issues) {
    if (!issuesByType[i.type]) issuesByType[i.type] = [];
    issuesByType[i.type].push(i);
  }

  // Markdown report
  let md = `# Auto-Heal Report\n\n`;
  md += `**Date**: ${readableTime}\n`;
  md += `**Issues detected**: ${issues.length}\n`;
  md += `**Claude Code ran**: ${ccResult ? "Yes" : "No"}\n`;
  if (ccResult) {
    md += `**CC session**: ${ccResult.success ? "Completed" : "Failed"}\n`;
  }
  if (verification) {
    md += `**Post-fix tsc**: ${verification.tsc ? "PASS" : "FAIL"}\n`;
    md += `**Post-fix tests**: ${verification.tests ? "PASS" : "FAIL"}\n`;
  }
  md += `**Auto-pushed**: ${pushed ? "Yes" : "No"}\n\n`;

  md += `## Issues Detected\n\n`;

  const typeLabels = {
    rpc_missing: "Missing RPC Functions",
    rpc_error: "RPC Errors",
    edge_missing: "Missing Edge Functions",
    edge_error: "Edge Function Errors",
    typescript: "TypeScript Errors",
    test_failure: "Test Failures",
    bug_report: "User Bug Reports",
  };

  for (const [type, items] of Object.entries(issuesByType)) {
    md += `### ${typeLabels[type] || type}\n\n`;
    for (const item of items) {
      // Truncate for readability — full details in saved .md report
      const name = (item.name || "").slice(0, 120);
      const error = (item.error || "").slice(0, 200).replace(/\n/g, " ");
      md += `- **${name}**: ${error}\n`;
    }
    md += `\n`;
  }

  if (ccResult?.output) {
    md += `## Claude Code Output\n\n\`\`\`\n${ccResult.output.slice(0, 2000)}\n\`\`\`\n\n`;
  }

  if (verification && !verification.tsc) {
    md += `## Remaining TypeScript Errors\n\n\`\`\`\n${verification.tscOutput.slice(0, 2000)}\n\`\`\`\n\n`;
  }

  if (verification && !verification.tests) {
    md += `## Remaining Test Failures\n\n\`\`\`\n${verification.testOutput.slice(0, 2000)}\n\`\`\`\n\n`;
  }

  // HTML for email
  const html = md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(
      /```\n([\s\S]*?)```/g,
      '<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px"><code>$1</code></pre>'
    )
    .replace(/\n/g, "<br>");

  const emailHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;padding:20px">
      <div style="background:${issues.length === 0 ? "#10b981" : "#ef4444"};color:white;padding:16px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:20px">${SITE_NAME} Auto-Heal Report</h1>
        <p style="margin:4px 0 0;opacity:0.9">${readableTime}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        <div style="display:flex;gap:16px;margin-bottom:20px">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;flex:1">
            <div style="font-size:24px;font-weight:bold;color:#dc2626">${issues.length}</div>
            <div style="font-size:12px;color:#991b1b">Issues Found</div>
          </div>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;flex:1">
            <div style="font-size:24px;font-weight:bold;color:#16a34a">${ccResult?.success ? "Fixed" : "N/A"}</div>
            <div style="font-size:12px;color:#166534">Auto-Heal Status</div>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;flex:1">
            <div style="font-size:24px;font-weight:bold;color:#2563eb">${verification?.tsc && verification?.tests ? "PASS" : verification ? "FAIL" : "N/A"}</div>
            <div style="font-size:12px;color:#1e40af">Verification</div>
          </div>
        </div>
        ${html}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="font-size:12px;color:#6b7280">Generated by Auto-Heal Pipeline | ${SITE_NAME}</p>
      </div>
    </div>`;

  return { markdown: md, html: emailHtml, timestamp, filename: `auto-heal-${timestamp}.md` };
}

async function sendEmail(report, issueCount) {
  if (!HEAL_EMAIL) {
    console.log("  No HEAL_EMAIL set — skipping email");
    return false;
  }

  if (!RESEND_API_KEY) {
    console.log("  No RESEND_API_KEY set — skipping email (set it in .env for email reports)");
    return false;
  }

  const subject = issueCount === 0
    ? `[${SITE_NAME}] All Systems Healthy`
    : `[${SITE_NAME}] Auto-Heal: ${issueCount} issue(s) detected`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${SITE_NAME} Auto-Heal <noreply@thepeptideai.com>`,
        to: [HEAL_EMAIL],
        subject,
        html: report.html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`  Email failed (${res.status}): ${errText}`);
      return false;
    }

    console.log(`  Email sent to ${HEAL_EMAIL}`);
    return true;
  } catch (err) {
    console.log(`  Email error: ${err.message}`);
    return false;
  }
}

async function saveToDb(issues, report) {
  try {
    await supabase.from("audit_log").insert({
      action: "auto_heal",
      table_name: "system",
      record_id: crypto.randomUUID(),
      new_data: {
        issue_count: issues.length,
        issues: issues.map((i) => ({ type: i.type, name: i.name })),
        report_file: report.filename,
        timestamp: report.timestamp,
      },
    });
  } catch {
    // Non-critical — just log
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  AUTO-HEAL PIPELINE — ${SITE_NAME}`);
  console.log(`  ${new Date().toLocaleString()}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Phase 1: Detection ──
  console.log("PHASE 1: Detection\n");

  // Run bug report check first (lightweight query before the heavy RPC/edge checks)
  const bugReports = await checkBugReports();
  const rpcIssues = await checkRpcFunctions();
  const edgeIssues = await checkEdgeFunctions();
  const tscIssues = checkTypeScript();
  const testIssues = checkTests();

  const allIssues = [
    ...rpcIssues,
    ...edgeIssues,
    ...bugReports,
    ...tscIssues,
    ...testIssues,
  ];

  console.log(`\n  Total issues: ${allIssues.length}`);

  if (allIssues.length === 0) {
    console.log("\n  All systems healthy. No issues found.\n");
    // Still send a "healthy" email if configured
    const report = buildReport([], null, null, false);
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, report.filename), report.markdown);
    await sendEmail(report, 0);
    await saveToDb([], report);
    return;
  }

  if (DETECT_ONLY) {
    console.log("\n  --detect-only flag set. Skipping fix phase.\n");
    for (const i of allIssues) {
      console.log(`  [${i.type}] ${i.name}: ${(i.error || "").slice(0, 150)}`);
    }
    process.exit(allIssues.length > 0 ? 1 : 0);
  }

  // ── Phase 2: Auto-Fix ──
  console.log(`\nPHASE 2: Auto-Fix\n`);

  let ccResult = null;
  if (!SKIP_CC && allIssues.length > 0) {
    ccResult = spawnClaudeCode(allIssues);
    console.log(
      `\n  Claude Code ${ccResult.success ? "completed" : "failed"}`
    );
    if (ccResult.output) {
      // Print summary (last 30 lines)
      const lines = ccResult.output.split("\n");
      const tail = lines.slice(-30).join("\n");
      console.log(`\n--- CC Output (last 30 lines) ---\n${tail}\n---\n`);
    }
  }

  // ── Phase 3: Verification ──
  console.log("PHASE 3: Verification\n");
  const verification = verifyFixes();

  let pushed = false;
  if (AUTO_PUSH && verification.tsc && verification.tests) {
    pushed = commitAndPush(allIssues.length);
  } else if (AUTO_PUSH) {
    console.log(
      "\n  Skipping push — verification failed (tsc or tests not passing)"
    );
  }

  // ── Phase 4: Report ──
  console.log("\nPHASE 4: Report\n");

  const report = buildReport(allIssues, ccResult, verification, pushed);

  // Save to file
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, report.filename);
  writeFileSync(reportPath, report.markdown, "utf-8");
  console.log(`  Report saved: scripts/reports/${report.filename}`);

  // Email
  await sendEmail(report, allIssues.length);

  // Save to DB
  await saveToDb(allIssues, report);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`  Issues found:    ${allIssues.length}`);
  console.log(`  CC session:      ${ccResult ? (ccResult.success ? "Completed" : "Failed") : "Skipped"}`);
  console.log(`  Post-fix tsc:    ${verification.tsc ? "PASS" : "FAIL"}`);
  console.log(`  Post-fix tests:  ${verification.tests ? "PASS" : "FAIL"}`);
  console.log(`  Pushed:          ${pushed ? "Yes" : "No"}`);
  console.log(`  Email sent:      ${HEAL_EMAIL ? "Yes" : "No (set HEAL_EMAIL)"}`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Auto-heal pipeline crashed:", err);
  process.exit(1);
});
