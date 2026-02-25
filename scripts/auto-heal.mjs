#!/usr/bin/env node
/**
 * Auto-Heal Pipeline — Automated issue detection, Claude Code repair, and email reporting.
 *
 * Usage:
 *   npm run auto-heal                    # Detect + fix + email report
 *   npm run auto-heal -- --detect-only   # Just detect issues, don't fix
 *   npm run auto-heal -- --auto-push     # Fix + commit + push to main
 *   npm run auto-heal -- --skip-cc       # Fix tsc/test only (no Claude Code)
 *
 * Required .env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional .env:
 *   HEAL_EMAIL         — where to send reports (your email)
 *   RESEND_API_KEY     — for email delivery (free at resend.com)
 *   VITE_SUPABASE_URL  — fallback for SUPABASE_URL
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

const env = { ...process.env, ...loadEnv() };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
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
  for (const fn of RPC_FUNCTIONS) {
    try {
      const { error } = await supabase.rpc(fn, {});
      if (
        error?.message?.includes("Could not find the function") ||
        error?.message?.includes("not found in the schema cache")
      ) {
        issues.push({
          type: "rpc_missing",
          name: fn,
          error: "Function not found in database",
        });
        console.log(`    FAIL: RPC ${fn} — not found`);
      }
    } catch (err) {
      issues.push({
        type: "rpc_error",
        name: fn,
        error: err.message,
      });
    }
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
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, metadata, created_at, user_id")
    .eq("action", "bug_report")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.log(`    WARN: Could not query bug reports: ${error.message}`);
    return [];
  }

  const reports = (data || []).map((r) => ({
    type: "bug_report",
    name: `Bug: ${r.metadata?.description?.slice(0, 80) || "untitled"}`,
    error: r.metadata?.description || "No description",
    page: r.metadata?.page_hash || "unknown",
    reportedAt: r.created_at,
    userId: r.user_id,
  }));

  if (reports.length > 0) {
    console.log(`    Found ${reports.length} bug report(s) in last 24h`);
  }
  return reports;
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
    // Extract failed test names
    const failLines = output
      .split("\n")
      .filter((l) => l.includes("FAIL") || l.includes("AssertionError"))
      .slice(0, 10);
    console.log(`    FAIL: Test failures detected`);
    return failLines.length > 0
      ? failLines.map((l) => ({
          type: "test_failure",
          name: "Test",
          error: l.trim(),
        }))
      : [
          {
            type: "test_failure",
            name: "Test",
            error: "Tests failed — check vitest output",
          },
        ];
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
        env: { ...process.env, FORCE_COLOR: "0" },
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
      md += `- **${item.name}**: ${item.error}\n`;
    }
    md += `\n`;
  }

  if (ccResult?.output) {
    md += `## Claude Code Output\n\n\`\`\`\n${ccResult.output.slice(0, 5000)}\n\`\`\`\n\n`;
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
      metadata: {
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

  const rpcIssues = await checkRpcFunctions();
  const edgeIssues = await checkEdgeFunctions();
  const bugReports = await checkBugReports();
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
      console.log(`  [${i.type}] ${i.name}: ${i.error}`);
    }
    return;
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
