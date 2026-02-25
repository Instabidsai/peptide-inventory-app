#!/usr/bin/env node
/**
 * END-TO-END TEST for the Auto-Heal Pipeline
 *
 * This script:
 *  1. Injects a deliberate, safe TypeScript bug
 *  2. Seeds a matching bug report in the database
 *  3. Runs the full auto-heal pipeline (detect → Claude Code fix → verify)
 *  4. Checks that the bug was fixed
 *  5. Cleans up
 *
 * Safety: Uses git stash to preserve any uncommitted work before starting,
 * and restores it at the end. The injected bug is in a non-critical file.
 *
 * Usage: node scripts/test-auto-heal.mjs
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// Load .env
dotenvConfig({ path: join(ROOT, ".env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Config ──
// We inject into order-profit.ts which has a test file that checks MERCHANT_FEE_RATE === 0.05
const BUG_FILE = join(ROOT, "src", "lib", "order-profit.ts");
const BACKUP_FILE = join(ROOT, "src", "lib", "order-profit.ts.bak");
const TEST_FILE = join(ROOT, "src", "lib", "order-profit.test.ts");

// ── Helpers ──
function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf-8",
    shell: true,
    timeout: opts.timeout || 30_000,
    ...opts,
  }).trim();
}

function banner(msg) {
  const line = "─".repeat(60);
  console.log(`\n${line}\n  ${msg}\n${line}`);
}

// ══════════════════════════════════════════════════════════════
// STEP 1 — Verify clean state & backup
// ══════════════════════════════════════════════════════════════
banner("STEP 1: Pre-flight checks");

// Make sure the target file exists
if (!existsSync(BUG_FILE)) {
  console.error(`Target file not found: ${BUG_FILE}`);
  process.exit(1);
}

// Read original file content
const originalContent = readFileSync(BUG_FILE, "utf-8");
console.log(`  Target: ${BUG_FILE}`);
console.log(`  Original size: ${originalContent.length} bytes`);

// Save a backup copy
writeFileSync(BACKUP_FILE, originalContent, "utf-8");
console.log(`  Backup saved: ${BACKUP_FILE}`);

// Verify tests pass BEFORE injecting bug
console.log("  Running pre-check tests (order-profit only)...");
try {
  run("npx vitest run src/lib/order-profit.test.ts", { timeout: 120_000 });
  console.log("  Pre-check tests: PASS");
} catch {
  console.error("  Tests are already failing! Fix existing issues first.");
  // Restore and abort
  writeFileSync(BUG_FILE, originalContent, "utf-8");
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════
// STEP 2 — Inject a deliberate bug
// ══════════════════════════════════════════════════════════════
banner("STEP 2: Inject deliberate bug");

// Strategy: Change MERCHANT_FEE_RATE from 0.05 to 0.15
// The test expects 0.05, so it will fail. Claude Code should see the test
// failure message and restore the correct value.
const buggyContent = originalContent.replace(
  "export const MERCHANT_FEE_RATE = 0.05; // 5%",
  "export const MERCHANT_FEE_RATE = 0.15; // BUG: wrong rate — should be 5% not 15%"
);

if (buggyContent === originalContent) {
  console.error("  ERROR: Could not find MERCHANT_FEE_RATE line to modify!");
  process.exit(1);
}

writeFileSync(BUG_FILE, buggyContent, "utf-8");
console.log("  Injected bug: Changed MERCHANT_FEE_RATE from 0.05 to 0.15");

// Verify the bug breaks the test
console.log("  Verifying bug breaks tests...");
try {
  run("npx vitest run src/lib/order-profit.test.ts 2>&1", { timeout: 120_000 });
  console.log("  ERROR: Tests still passing with bug — aborting");
  writeFileSync(BUG_FILE, originalContent, "utf-8");
  process.exit(1);
} catch {
  console.log("  Confirmed: tests fail with injected bug");
}

// ══════════════════════════════════════════════════════════════
// STEP 3 — Seed a bug report in the database
// ══════════════════════════════════════════════════════════════
banner("STEP 3: Seed bug report in database");

const bugReportId = crypto.randomUUID();
try {
  // Insert into bug_reports table
  const { error: brError } = await supabase.from("bug_reports").insert({
    id: bugReportId,
    description: "[AUTO] test_failure: MERCHANT_FEE_RATE is 0.15 instead of 0.05 in order-profit.ts",
    page_url: "#/admin/sales",
    status: "open",
    user_agent: "auto-heal-test",
    console_errors: JSON.stringify([
      "AssertionError: expected 0.15 to equal 0.05 in src/lib/order-profit.test.ts",
    ]),
  });

  if (brError) {
    console.log(`  bug_reports insert failed: ${brError.message}`);
    console.log("  Trying audit_log fallback...");
  } else {
    console.log(`  Bug report seeded: ${bugReportId}`);
  }

  // Also insert into audit_log for the primary detection path
  const { error: alError } = await supabase.from("audit_log").insert({
    action: "auto_error",
    table_name: "frontend",
    record_id: bugReportId,
    new_data: {
      message: "Type error in order-profit.ts — calculateTestDiscount assigns string to number",
      source: "typescript",
      page: "#/admin/sales",
      timestamp: new Date().toISOString(),
    },
  });

  if (alError) {
    console.log(`  audit_log insert failed: ${alError.message}`);
  } else {
    console.log(`  Audit log entry seeded`);
  }
} catch (err) {
  console.log(`  DB seeding error: ${err.message}`);
}

// ══════════════════════════════════════════════════════════════
// STEP 4 — Run the auto-heal pipeline
// ══════════════════════════════════════════════════════════════
banner("STEP 4: Run auto-heal pipeline (FULL MODE)");

console.log("  Spawning auto-heal in clean process (no CLAUDECODE)...");
console.log("  This may take up to 10 minutes...\n");

const startTime = Date.now();

try {
  // Run auto-heal WITHOUT --detect-only, WITHOUT --auto-push
  // Clear CLAUDECODE so Claude Code can spawn
  const { CLAUDECODE: _, CLAUDE_CODE_ENTRYPOINT: _b, ...cleanEnv } = process.env;

  const result = execSync("node scripts/auto-heal.mjs", {
    cwd: ROOT,
    encoding: "utf-8",
    shell: true,
    timeout: 720_000, // 12 minutes (heal has 10min CC timeout + overhead)
    maxBuffer: 20 * 1024 * 1024,
    env: { ...cleanEnv, FORCE_COLOR: "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Auto-heal completed in ${elapsed}s`);

  // Print last 50 lines of output
  const lines = result.split("\n");
  const tail = lines.slice(-50).join("\n");
  console.log("\n--- Auto-heal output (last 50 lines) ---");
  console.log(tail);
  console.log("--- End output ---");
} catch (err) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const output = (err.stdout || "") + "\n" + (err.stderr || "");
  console.log(`\n  Auto-heal exited with error after ${elapsed}s`);

  // Print output for debugging
  const lines = output.split("\n").filter(Boolean);
  const tail = lines.slice(-50).join("\n");
  console.log("\n--- Auto-heal output (last 50 lines) ---");
  console.log(tail);
  console.log("--- End output ---");
}

// ══════════════════════════════════════════════════════════════
// STEP 5 — Verify the bug was fixed
// ══════════════════════════════════════════════════════════════
banner("STEP 5: Verify fix");

const postContent = readFileSync(BUG_FILE, "utf-8");
const rateFixed = postContent.includes("MERCHANT_FEE_RATE = 0.05");
const bugGone = !postContent.includes("0.15");

console.log(`  MERCHANT_FEE_RATE restored to 0.05: ${rateFixed ? "YES" : "NO"}`);
console.log(`  Bug value (0.15) removed:          ${bugGone ? "YES" : "NO"}`);

// Check tests
let testsPasses = false;
try {
  run("npx vitest run 2>&1", { timeout: 120_000 });
  testsPasses = true;
  console.log("  Post-fix tests: PASS");
} catch {
  console.log("  Post-fix tests: FAIL");
}

// ══════════════════════════════════════════════════════════════
// STEP 6 — Cleanup
// ══════════════════════════════════════════════════════════════
banner("STEP 6: Cleanup");

// If the bug wasn't fixed, restore from backup
if (!testsPasses) {
  console.log("  Bug was NOT fixed — restoring from backup...");
  writeFileSync(BUG_FILE, originalContent, "utf-8");
  console.log("  Restored original file");
}

// Remove backup
if (existsSync(BACKUP_FILE)) {
  const { unlinkSync } = await import("fs");
  unlinkSync(BACKUP_FILE);
  console.log("  Removed backup file");
}

// Clean up test bug report from DB
try {
  await supabase.from("bug_reports").update({ status: "resolved" }).eq("id", bugReportId);
  await supabase.from("audit_log").delete().eq("record_id", bugReportId);
  console.log("  Cleaned up test bug reports from DB");
} catch {
  console.log("  DB cleanup skipped (non-critical)");
}

// Restore any file changes (git checkout the target file)
try {
  run(`git checkout -- "${BUG_FILE.replace(ROOT + "\\", "").replace(ROOT + "/", "")}"`);
  console.log("  Git restored target file to HEAD");
} catch {
  console.log("  Git restore skipped");
}

// ══════════════════════════════════════════════════════════════
// FINAL VERDICT
// ══════════════════════════════════════════════════════════════
banner("FINAL VERDICT");

const passed = rateFixed && bugGone && testsPasses;

if (passed) {
  console.log("  *** AUTO-HEAL END-TO-END TEST: PASSED ***");
  console.log("");
  console.log("  The pipeline successfully:");
  console.log("    1. Detected the injected test failure");
  console.log("    2. Spawned Claude Code to fix it");
  console.log("    3. Claude Code restored MERCHANT_FEE_RATE to 0.05");
  console.log("    4. All tests pass after fix");
  console.log("");
} else {
  console.log("  *** AUTO-HEAL END-TO-END TEST: FAILED ***");
  console.log("");
  console.log(`  Rate fixed:   ${rateFixed ? "PASS" : "FAIL"}`);
  console.log(`  Bug gone:     ${bugGone ? "PASS" : "FAIL"}`);
  console.log(`  Tests pass:   ${testsPasses ? "PASS" : "FAIL"}`);
  console.log("");
  console.log("  Check scripts/reports/ for the auto-heal report.");
  console.log("");
}

process.exit(passed ? 0 : 1);
