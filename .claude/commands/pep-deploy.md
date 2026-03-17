# Safe Production Deploy

> /pep-deploy [optional: description of what changed]

## Purpose

The safest possible way to ship PeptideAI code to production. Every step is a hard gate — if any check fails, the deploy stops. No shortcuts, no skipping checks. Covers: preflight, git hygiene, edge function deployment, user approval, post-deploy smoke tests, multi-org verification, and documentation updates.

## PeptideAI Context
```
PROJECT:      ~/Peptide Inv App
STACK:        Vite + React 18 + TypeScript + shadcn/ui + TanStack Query
DB:           Supabase (57 tables, RLS on all, 153 migrations)
EDGE FNS:    49 Supabase Edge Functions + _shared/ utilities
LOCAL DEV:    npm run dev → http://localhost:4550
PRODUCTION:   https://app.thepeptideai.com
DEPLOY:       git push origin main:master && git push origin main:main
PREFLIGHT:    npm run preflight (typecheck + lint + cycles + build)
ROLES:        admin, staff, sales_rep, customer, vendor
CRITICAL:     org_id on every query, verify_jwt=false, set_config before writes,
              tenant_config UPDATE only, import from @/integrations/sb_client/client
```

---

## Step 1: PREFLIGHT — Hard Gate

Run the full preflight suite. If it fails, the deploy is blocked. Do NOT proceed.

```bash
cd ~/Peptide\ Inv\ App && npm run preflight
```

This runs: typecheck (`npx tsc --noEmit`) + lint + circular dependency check + production build.

**If preflight fails**: Stop immediately. Report the exact errors. Do NOT continue to any subsequent step. The user must fix the issues and re-run `/deploy`.

---

## Step 2: GIT STATUS — Check for Uncommitted Changes

```bash
cd ~/Peptide\ Inv\ App && git status
```

Review the output:

- **If clean (nothing to commit)**: Proceed to Step 3.
- **If there are uncommitted changes**:
  1. Show the user the full list of changed/untracked files.
  2. Ask the user which specific files to stage.
  3. **NEVER run `git add -A` or `git add .`** — always stage files individually:
     ```bash
     git add src/path/to/file1.ts src/path/to/file2.ts
     ```
  4. Verify no secrets or env files are staged:
     ```bash
     git diff --cached --name-only
     ```
     If any `.env`, credentials, or key files appear in staged files, **STOP** and warn the user.
  5. Create a commit with a descriptive message (ask user for message or draft one based on changes):
     ```bash
     git commit -m "$(cat <<'EOF'
     <commit message here>

     Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
     EOF
     )"
     ```

---

## Step 2B: LOCAL SMOKE TEST — Verify Before Shipping

If there are frontend changes, start the dev server and confirm the app works locally before pushing anything:

```bash
cd ~/Peptide\ Inv\ App && npm run dev
```
Wait for "Local: http://localhost:4550" in output.

Then use Playwright to verify:
1. `mcp__playwright__browser_navigate` to `http://localhost:4550`
2. `mcp__playwright__browser_take_screenshot` — confirm app loads
3. `mcp__playwright__browser_console_messages` — confirm 0 JS errors
4. If the deploy includes UI changes, navigate to the affected page and screenshot

If the local app is broken, **STOP**. Do not proceed to deploy.

---

## Step 3: DETECT MODIFIED EDGE FUNCTIONS

Check which edge functions were modified compared to the deployed version:

```bash
cd ~/Peptide\ Inv\ App && git diff origin/main --name-only -- supabase/functions/
```

If no edge functions were modified, skip to Step 4.

If edge functions were modified:
1. List each modified function by name (directory name under `supabase/functions/`).
2. Show the user the list and confirm they should be deployed.
3. Deploy each one individually using:
   ```bash
   cd ~/Peptide\ Inv\ App && npx supabase functions deploy <function-name>
   ```
   **NEVER deploy all functions at once.** Deploy only the modified ones, one at a time.
4. Verify each deployment succeeds before moving to the next.
5. If any deployment fails, **STOP** and report the error. Do NOT continue.

---

## Step 4: MULTI-ORG VERIFICATION — MANDATORY

**This step is MANDATORY. It is never optional, never conditional, never skippable.**

Identify all tables affected by this deploy (check migrations, edge functions, and code changes). For EACH affected table, run ALL of these checks using `mcp__supabase__execute_sql`:

### Check 1: org_id column exists and is NOT NULL
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = '<table>' AND column_name = 'org_id';
```
**FAIL** if org_id doesn't exist or is_nullable = 'YES'.

### Check 2: Zero rows with NULL org_id
```sql
SELECT COUNT(*) AS null_org_count FROM <table> WHERE org_id IS NULL;
```
**FAIL** if count > 0.

### Check 3: RLS is ENABLED
```sql
SELECT relrowsecurity FROM pg_class WHERE relname = '<table>';
```
**FAIL** if relrowsecurity = false.

### Check 4: RLS policies scope by org_id
```sql
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = '<table>';
```
**FAIL** if any policy uses `USING(true)` without org_id scoping (service-role-only exceptions must be explicitly noted).

### Check 5: Cross-org isolation
Pick two different org_ids from the table and verify that querying as Org A returns zero rows belonging to Org B:
```sql
SELECT COUNT(*) FROM <table>
WHERE org_id = '<org_a_id>'
AND id IN (SELECT id FROM <table> WHERE org_id = '<org_b_id>');
```
**FAIL** if count > 0.

### Check 6: Code-level org_id scoping
Use Grep to verify that every hook, edge function, and API call touching the affected tables includes `.eq('org_id', ...)` or equivalent org_id filtering.

**If ANY check fails on ANY table**: The deploy is NOT safe. Report all failures. Do NOT proceed to Step 5. The user must fix the org isolation issues first.

---

## Step 5: DEPLOY GATE — Explicit User Approval

**Do NOT push automatically.** Present the user with a summary:

```
=== DEPLOY SUMMARY ===
Preflight:        PASSED
Git status:       <clean / N files committed>
Edge functions:   <list of deployed functions, or "none modified">
Multi-org checks: PASSED (N tables verified)

Ready to push to production?
Target: git push origin main:master && git push origin main:main
```

Use `AskUserQuestion` to get explicit approval:
- **Option 1**: "Push to production" — proceed with deploy
- **Option 2**: "Abort deploy" — stop everything, do not push

**Only if the user selects "Push to production"**, run:
```bash
cd ~/Peptide\ Inv\ App && git push origin main:master && git push origin main:main
```

If the push fails, report the error. Do NOT force push. Do NOT use `--force`.

---

## Step 6: POST-DEPLOY SMOKE TEST

After a successful push, wait for Vercel to build. Check build status:
```bash
cd ~/Peptide\ Inv\ App && npx vercel inspect --token=$VERCEL_TOKEN 2>/dev/null || echo "Check https://vercel.com/justins-projects-e2daa9e4 manually"
```
If no Vercel CLI access, wait 60 seconds then proceed with smoke test.

### 6a: Navigate to production
Use `mcp__playwright__browser_navigate` to open `https://app.thepeptideai.com`.

### 6b: Verify app loads
Use `mcp__playwright__browser_take_screenshot` to capture the landing/login page. Verify:
- Page loads without errors (no blank screen, no 500 errors)
- Login form is visible

### 6c: Login test
Use `mcp__playwright__browser_fill_form` to enter test credentials (ask user for credentials — NEVER store them to disk).

### 6d: Verify authenticated state
Use `mcp__playwright__browser_take_screenshot` after login. Verify:
- Dashboard loads
- No console errors (check with `mcp__playwright__browser_console_messages`)
- Navigation works

### 6e: Quick role check
If the deploy changed role-specific features, test with the relevant role.

**If smoke test fails**: Alert the user immediately. The code is already deployed, so present options:
1. **Hotfix** — use `/debug` to diagnose and fix, then re-run `/deploy`
2. **Rollback** — `git revert HEAD && git push origin main:master && git push origin main:main`
3. **Investigate** — keep live, debug manually

Ask the user which option. Do NOT rollback without approval.

---

## Step 7: DOC UPDATE

Update all relevant documentation files after a successful deploy:

### Always update:
- `.agent/decisions-log.jsonl` — Append a line with what was deployed and why:
  ```json
  {"date":"YYYY-MM-DD","decision":"Deployed <summary>","reason":"<why>","author":"claude"}
  ```

### Update if relevant tables/schema changed:
- `.agent/schema.sql` — Consolidated DB schema snapshot
- `supabase/migrations/CLAUDE.md` — Migration conventions and timeline

### Update if edge functions changed:
- `supabase/functions/CLAUDE.md` — Edge function catalog

### Update if frontend changed:
- `src/CLAUDE.md` — Frontend architecture overview
- `src/hooks/CLAUDE.md` — Hook catalog with query keys and tables
- `src/pages/CLAUDE.md` — Route map with roles and key hooks
- `src/components/CLAUDE.md` — Component directory map

### Update if scripts changed:
- `scripts/CLAUDE.md` — Script catalog by category

### Always review:
- `CLAUDE.md` (top-level) — Keep under 150 lines, update if architecture changed
- `.agent/runbook.md` — Add new symptoms/fixes discovered during deploy
- `.agent/conventions.md` — Add any new patterns established

---

## Critical Rules

### Universal Rules (ALL apply to every deploy):
1. **MULTI-ORG ISOLATION IS THE #1 RULE.** This is a multi-tenant app — every tenant's data MUST be invisible to every other tenant. org_id scoping is mandatory on every query, RLS policy, trigger, hook, and edge function. Every deploy MUST verify: (a) no NULL org_ids, (b) RLS enabled, (c) policies scope by org_id, (d) Org A cannot see Org B data. If ANY check fails, the task is NOT complete. This is never optional — skipping it ships a data leak.
2. Always import supabase from `@/integrations/sb_client/client`
3. `verify_jwt = false` in every edge function `config.toml`
4. `set_config()` must precede writes in edge functions (same SQL call)
5. `tenant_config`: ALWAYS UPDATE, never INSERT
6. Never store credentials to disk
7. Read `.agent/runbook.md` before proposing changes
8. Read `.agent/conventions.md` for non-obvious patterns
9. Paste EXACT code for anything being modified — never summarize
10. Test locally on `http://localhost:4550` before pushing
11. Never use `git add -A` — stage only specific changed files to avoid committing secrets

### Deploy-Specific Rules:
12. **Never force push** (`--force` or `--force-with-lease`) — if push fails, investigate why.
13. **Never skip preflight** — if it fails, the deploy is blocked until issues are fixed.
14. **Never deploy all edge functions at once** — only deploy modified ones, individually.
15. **Never push without explicit user approval** — always use the Deploy Gate.
16. **Never store test credentials** — ask the user each time for smoke test login.
17. **If smoke test fails post-deploy** — alert immediately, do not silently continue.
