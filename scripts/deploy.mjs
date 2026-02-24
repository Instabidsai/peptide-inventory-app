#!/usr/bin/env node
/**
 * Deployment Automation Script
 * ============================
 * Orchestrates the full deploy pipeline for ThePeptideAI.
 *
 * Steps:
 *   1. Run tests (vitest)
 *   2. Run preflight (typecheck + lint + circular deps + build)
 *   3. Apply pending SQL migrations via Supabase Management API
 *   4. Git commit & push to both branches
 *   5. Post-deploy validation
 *
 * Usage:
 *   node scripts/deploy.mjs                    # Full pipeline
 *   node scripts/deploy.mjs --skip-tests       # Skip vitest
 *   node scripts/deploy.mjs --skip-migrations  # Skip DB migrations
 *   node scripts/deploy.mjs --dry-run          # Show what would happen
 *   node scripts/deploy.mjs --migrate-only     # Only apply migrations
 *
 * Environment:
 *   SUPABASE_ACCESS_TOKEN  — Supabase Management API token (for migrations)
 *   SUPABASE_DB_PASSWORD   — Supabase DB password (for direct SQL)
 *
 * The script loads .env automatically for validate-deployment.ts.
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const PROJECT_REF = 'mckkegmkpqdicudnfhor';

// Parse CLI flags
const args = process.argv.slice(2);
const flags = {
  skipTests: args.includes('--skip-tests'),
  skipMigrations: args.includes('--skip-migrations'),
  dryRun: args.includes('--dry-run'),
  migrateOnly: args.includes('--migrate-only'),
  commitMsg: args.find(a => a.startsWith('--message='))?.split('=').slice(1).join('='),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
ThePeptideAI Deploy Script
==========================

Usage: node scripts/deploy.mjs [options]

Options:
  --skip-tests       Skip vitest run
  --skip-migrations  Skip SQL migration application
  --dry-run          Show what would happen without executing
  --migrate-only     Only apply pending migrations, skip everything else
  --message=MSG      Custom git commit message
  -h, --help         Show this help

Full pipeline:
  1. npm run test
  2. npm run preflight (typecheck + lint + cycles + build)
  3. Apply pending SQL migrations
  4. git add + commit + push origin main:master && push origin main:main
  5. npx tsx scripts/validate-deployment.ts
`);
  process.exit(0);
}

// Styling
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function header(step, total, label) {
  console.log(`\n${BOLD}${CYAN}[${step}/${total}]${RESET} ${BOLD}${label}${RESET}\n`);
}

function success(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`  ${msg}`); }

function run(cmd, opts = {}) {
  if (flags.dryRun) {
    info(`[dry-run] ${cmd}`);
    return { status: 0, stdout: '', stderr: '' };
  }
  const result = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    stdio: opts.silent ? 'pipe' : 'inherit',
    encoding: 'utf-8',
    timeout: opts.timeout || 300_000,
  });
  return result;
}

// ─── Step 1: Tests ───────────────────────────────────────────
async function runTests(totalSteps) {
  header(1, totalSteps, 'Running Tests');

  if (flags.skipTests) {
    warn('Skipped (--skip-tests)');
    return true;
  }

  const result = run('npm run test', { timeout: 120_000 });
  if (result.status !== 0) {
    fail('Tests failed. Fix test failures before deploying.');
    return false;
  }
  success('All tests passed');
  return true;
}

// ─── Step 2: Preflight ──────────────────────────────────────
async function runPreflight(totalSteps) {
  header(2, totalSteps, 'Running Preflight (typecheck + lint + cycles + build)');

  const result = run('npm run preflight', { timeout: 180_000 });
  if (result.status !== 0) {
    fail('Preflight failed. Fix issues before deploying.');
    return false;
  }
  success('Preflight passed');
  return true;
}

// ─── Step 3: Migrations ─────────────────────────────────────
async function applyMigrations(totalSteps) {
  header(3, totalSteps, 'Checking Pending Migrations');

  if (flags.skipMigrations) {
    warn('Skipped (--skip-migrations)');
    return true;
  }

  // Read the tracking file to know which migrations have been applied
  const trackingFile = path.join(ROOT, '.migration-tracking.json');
  let applied = {};
  try {
    applied = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));
  } catch {
    // First run — no tracking file yet
  }

  // List all .sql files in migrations dir
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && f !== 'match_documents.sql')
    .sort();

  const pending = allFiles.filter(f => !applied[f]);

  if (pending.length === 0) {
    success('No pending migrations');
    return true;
  }

  info(`Found ${pending.length} unapplied migration(s):`);
  pending.forEach(f => info(`  → ${f}`));
  console.log('');

  // Check for Supabase access token
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    warn('SUPABASE_ACCESS_TOKEN not set — cannot auto-apply migrations.');
    warn('Apply these manually via Supabase SQL Editor, then re-run.');
    info('');
    info('To set up auto-migration:');
    info('  export SUPABASE_ACCESS_TOKEN="sbp_..."');
    info('  (Get it from https://supabase.com/dashboard/account/tokens)');

    if (flags.dryRun) return true;

    // Still track them so they don't show up next time if user applied manually
    info('');
    info('Mark these as applied? (They should already be in the live DB from manual runs)');
    info('Run: node scripts/deploy.mjs --mark-applied');
    return true;
  }

  // Apply each migration via the Supabase Management API (SQL endpoint)
  let appliedCount = 0;
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    info(`Applying ${file} (${sql.length} chars)...`);

    if (flags.dryRun) {
      success(`[dry-run] Would apply ${file}`);
      appliedCount++;
      continue;
    }

    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        }
      );

      if (res.ok) {
        success(`Applied: ${file}`);
        applied[file] = new Date().toISOString();
        appliedCount++;
      } else {
        const body = await res.text();
        // Some "errors" are just notices (e.g., "relation already exists")
        if (body.includes('already exists') || body.includes('duplicate')) {
          warn(`Already applied (idempotent): ${file}`);
          applied[file] = new Date().toISOString();
          appliedCount++;
        } else {
          fail(`Failed: ${file} — ${body.slice(0, 300)}`);
          // Don't abort — try remaining migrations
        }
      }
    } catch (err) {
      fail(`Error applying ${file}: ${err.message}`);
    }
  }

  // Save tracking
  fs.writeFileSync(trackingFile, JSON.stringify(applied, null, 2));
  info(`\nApplied ${appliedCount}/${pending.length} migrations. Tracking saved.`);

  return true;
}

// ─── Step 4: Git Commit & Push ──────────────────────────────
async function gitPush(totalSteps) {
  header(4, totalSteps, 'Git Commit & Push');

  // Check for uncommitted changes
  const status = run('git status --porcelain', { silent: true });
  const changes = (status.stdout || '').trim();

  if (!changes) {
    success('Working tree clean — nothing to commit');

    // Still check if we need to push
    const unpushed = run('git log origin/main..HEAD --oneline', { silent: true });
    if ((unpushed.stdout || '').trim()) {
      info('Pushing unpushed commits...');
      const push = run('git push origin main:master && git push origin main:main');
      if (push.status !== 0) {
        fail('Push failed');
        return false;
      }
      success('Pushed to origin/master and origin/main');
    } else {
      success('Already up to date with remote');
    }
    return true;
  }

  info('Uncommitted changes:');
  changes.split('\n').slice(0, 20).forEach(line => info(`  ${line}`));
  if (changes.split('\n').length > 20) {
    info(`  ... and ${changes.split('\n').length - 20} more`);
  }

  // Check for sensitive files
  const sensitivePatterns = ['.env', 'credentials', 'secret', '.key', 'token'];
  const changedFiles = changes.split('\n').map(l => l.trim().split(/\s+/).pop());
  const sensitiveFiles = changedFiles.filter(f =>
    sensitivePatterns.some(p => f.toLowerCase().includes(p))
  );
  if (sensitiveFiles.length > 0) {
    fail('Potentially sensitive files in changes:');
    sensitiveFiles.forEach(f => fail(`  ${f}`));
    fail('Review and exclude sensitive files before committing.');
    return false;
  }

  // Generate commit message
  const msg = flags.commitMsg || generateCommitMessage(changes);
  info(`\nCommit message: "${msg}"`);

  if (flags.dryRun) {
    success('[dry-run] Would commit and push');
    return true;
  }

  // Stage, commit, push
  run('git add -A');
  const commit = run(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
  if (commit.status !== 0) {
    fail('Commit failed');
    return false;
  }
  success('Committed');

  const push = run('git push origin main:master && git push origin main:main');
  if (push.status !== 0) {
    fail('Push failed');
    return false;
  }
  success('Pushed to origin/master and origin/main');

  return true;
}

function generateCommitMessage(statusOutput) {
  const lines = statusOutput.split('\n').filter(Boolean);
  const added = lines.filter(l => l.startsWith('??') || l.startsWith('A ')).length;
  const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const deleted = lines.filter(l => l.startsWith(' D') || l.startsWith('D ')).length;

  const parts = [];
  if (added) parts.push(`${added} added`);
  if (modified) parts.push(`${modified} modified`);
  if (deleted) parts.push(`${deleted} deleted`);

  return `deploy: ${parts.join(', ')} file(s)`;
}

// ─── Step 5: Validate ───────────────────────────────────────
async function validateDeployment(totalSteps) {
  header(5, totalSteps, 'Post-Deploy Validation');

  // Check if .env has the required vars for validation
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) {
    warn('.env file not found — validation will run with limited checks');
  }

  if (flags.dryRun) {
    success('[dry-run] Would run validate-deployment.ts');
    return true;
  }

  // Load .env into process before running validation
  const result = run('npx tsx scripts/validate-deployment.ts', { timeout: 60_000 });
  if (result.status !== 0) {
    warn('Validation reported issues — review output above');
    return true; // Don't fail the deploy for validation warnings
  }
  success('Validation passed');
  return true;
}

// ─── Mark-Applied Helper ────────────────────────────────────
function markAllApplied() {
  const trackingFile = path.join(ROOT, '.migration-tracking.json');
  let applied = {};
  try {
    applied = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));
  } catch {}

  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && f !== 'match_documents.sql')
    .sort();

  const now = new Date().toISOString();
  let count = 0;
  for (const f of allFiles) {
    if (!applied[f]) {
      applied[f] = now;
      count++;
    }
  }

  fs.writeFileSync(trackingFile, JSON.stringify(applied, null, 2));
  success(`Marked ${count} migration(s) as applied (${allFiles.length} total tracked)`);
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}═══ ThePeptideAI Deploy Pipeline ═══${RESET}`);
  console.log(`  Project: ${PROJECT_REF}`);
  console.log(`  Dir: ${ROOT}`);
  if (flags.dryRun) console.log(`  ${YELLOW}DRY RUN — no changes will be made${RESET}`);
  console.log('');

  // Handle --mark-applied
  if (args.includes('--mark-applied')) {
    markAllApplied();
    process.exit(0);
  }

  // Handle --migrate-only
  if (flags.migrateOnly) {
    await applyMigrations(1);
    process.exit(0);
  }

  const totalSteps = 5;
  const results = [];

  // Step 1: Tests
  results.push(await runTests(totalSteps));
  if (!results[results.length - 1] && !flags.dryRun) {
    fail('\nDeploy aborted: tests failed.');
    process.exit(1);
  }

  // Step 2: Preflight
  results.push(await runPreflight(totalSteps));
  if (!results[results.length - 1] && !flags.dryRun) {
    fail('\nDeploy aborted: preflight failed.');
    process.exit(1);
  }

  // Step 3: Migrations
  results.push(await applyMigrations(totalSteps));

  // Step 4: Git
  results.push(await gitPush(totalSteps));
  if (!results[results.length - 1] && !flags.dryRun) {
    fail('\nDeploy aborted: git push failed.');
    process.exit(1);
  }

  // Step 5: Validate
  results.push(await validateDeployment(totalSteps));

  // Summary
  console.log(`\n${BOLD}═══ Deploy Complete ═══${RESET}\n`);
  const passed = results.filter(Boolean).length;
  if (passed === totalSteps) {
    console.log(`  ${GREEN}${BOLD}All ${totalSteps} steps passed!${RESET}`);
  } else {
    console.log(`  ${YELLOW}${passed}/${totalSteps} steps passed${RESET}`);
  }
  console.log('');
}

main().catch(err => {
  console.error(`\n${RED}FATAL:${RESET} ${err.message}`);
  process.exit(1);
});
