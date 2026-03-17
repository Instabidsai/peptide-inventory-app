# Fix — Diagnose, Fix & Verify

> /pep-fix <description of the bug: what's broken, error messages, affected page/function>

## Purpose

When something is broken in production or dev — a page crashes, data is wrong, an edge function fails, or a user reports a bug — this skill reproduces the issue, traces the data flow, identifies root cause, implements the fix, and verifies it. No approval gates. Just diagnose → fix → verify.

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

## Credentials

When the user provides login credentials, store them for Playwright testing:
```
CREDENTIALS (provided by user at invocation time):
- LOGIN: { url, email, password, role }
```

If not provided and the bug is UI-visible, ask:
> "To reproduce the bug in the browser, I need login credentials. Please provide: app URL, email, password, and role. These are session-only and never stored to disk."

If the bug is backend-only (edge function, DB, trigger), skip credentials — use Supabase MCP directly.

---

## Step 0: Pull Bug Reports from Database (ALWAYS RUN FIRST)

Before any manual investigation, check the `bug_reports` table for user-submitted and auto-detected reports that match the issue. This gives you real user context, screenshots, console errors, and page URLs.

```
SUPABASE PROJECT ID: mckkegmkpqdicudnfhor

1. Search for matching bug reports (user-submitted first, then auto-detected):
   Use mcp__supabase__execute_sql:

   -- User-submitted reports (most valuable — they have descriptions + screenshots)
   SELECT id, description, screenshot_url, page_url, user_email, user_role, console_errors, status, created_at
   FROM bug_reports
   WHERE description ILIKE '%<keyword from user's bug description>%'
   ORDER BY created_at DESC
   LIMIT 10;

   -- Recent open reports with screenshots (browse for visual context)
   SELECT id, description, screenshot_url, page_url, user_email, console_errors, created_at
   FROM bug_reports
   WHERE screenshot_url IS NOT NULL AND status IN ('open', 'new')
   ORDER BY created_at DESC
   LIMIT 10;

   -- Auto-detected errors on the same page
   SELECT id, description, console_errors, page_url, created_at
   FROM bug_reports
   WHERE page_url ILIKE '%<affected page hash>%' AND status IN ('open', 'new')
   ORDER BY created_at DESC
   LIMIT 20;

2. If a matching report has a screenshot_url:
   - Use the Read tool to view the screenshot image (it's a public URL)
   - The screenshot shows EXACTLY what the user saw when the bug happened
   - Use this to skip guesswork and go straight to the right component/page

3. Parse console_errors JSON for stack traces and error messages:
   - These are captured automatically by auto-error-reporter.ts
   - They contain: error source, message, stack trace, network failures, web vitals issues

4. Cross-reference with error_patterns table for recurring issues:
   SELECT fingerprint, occurrence_count, first_seen, last_seen, sample_description
   FROM error_patterns
   WHERE fingerprint IN (
     SELECT error_fingerprint FROM bug_reports WHERE description ILIKE '%<keyword>%'
   );

5. If a bug report has already been marked 'resolved' or has a fix_plan_id:
   - Check the fix_plans table: SELECT * FROM fix_plans WHERE id = '<fix_plan_id>';
   - This may contain a previous diagnosis you can build on

6. After pulling context, tell the user what you found:
   "Found X matching bug reports. Y have screenshots. Here's what users are seeing: [summary]"
```

**IMPORTANT**: If the user provides a specific bug report ID (e.g., "fix bug report abc-123"), pull that exact report first and use its screenshot + console errors as primary context. The screenshot IS the reproduction.

---

## Step 1: Triage — Classify the Bug (30 seconds)

From the user's description, determine:

- **Layer**: `UI` | `hook/query` | `edge-function` | `database` | `trigger` | `RLS` | `integration`
- **Severity**: `crash` (page won't load) | `data-wrong` (loads but incorrect) | `silent-fail` (no error, just doesn't work) | `error-visible` (user sees error message)
- **Affected entities**: Which tables, edge functions, hooks, components, pages
- **Reproduction path**: What steps trigger the bug

Output a 3-line triage:
```
LAYER:    <layer>
SEVERITY: <severity>
SUSPECT:  <most likely root cause in one sentence>
```

---

## Step 2: Reproduce the Issue

### If UI bug → Playwright reproduction

```
1. Use mcp__playwright__browser_navigate to go to the affected page
2. Use mcp__playwright__browser_take_screenshot — label it "BEFORE_FIX"
3. If login required: mcp__playwright__browser_fill_form + browser_click to log in
4. Navigate to the broken page/feature
5. Use mcp__playwright__browser_snapshot to capture the DOM state
6. Use mcp__playwright__browser_console_messages to capture JS errors
7. Take screenshot of the broken state — label it "BUG_REPRODUCED"
```

### If backend bug → Query reproduction

```
1. Use mcp__supabase__execute_sql to reproduce the data issue:
   - Query the affected table with the specific filters that trigger the bug
   - Check for NULL org_ids, missing FKs, wrong statuses, duplicate rows
   - Check trigger execution: SELECT * FROM pg_stat_user_functions WHERE funcname = '<suspect_function>';
2. If edge function: Check Supabase logs with mcp__supabase__get_logs
```

### If can't reproduce → Gather more context

Ask the user:
> "I couldn't reproduce the bug. Can you provide: (1) exact steps to trigger it, (2) any error messages or screenshots, (3) which org/user it affects?"

**Do NOT proceed past this step until the bug is reproduced or the data anomaly is confirmed.**

---

## Step 3: Trace the Data Flow — Parallel Research Agents

Launch **3 parallel agents** (Agent tool, subagent_type="Explore") to trace the bug from every angle simultaneously.

**Agent 1: "db-tracer"** — Database layer
```
Investigating bug: "<user's description>"

1. Read .agent/schema.sql for the affected tables
2. Search supabase/migrations/ for ALL migrations touching these tables (grep for table names)
3. Use the project's Supabase MCP tools if available, otherwise document what queries to run:
   - SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '<table>';
   - SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = '<table>';
   - SELECT tgname, tgtype, proname FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid WHERE tgrelid = '<table>'::regclass AND NOT tgisinternal;
   - For suspect functions: SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '<function>';
4. MULTI-ORG ISOLATION CHECK (MANDATORY — never skip):
   - SELECT COUNT(*) FROM <table> WHERE org_id IS NULL; — must be 0
   - SELECT relrowsecurity FROM pg_class WHERE relname = '<table>'; — must be true
   - SELECT policyname, qual FROM pg_policies WHERE tablename = '<table>'; — must scope by org_id
   - If ANY of these fail, flag it as a CRITICAL finding — it's a data leak
5. Check for other data anomalies:
   - Any orphaned foreign keys?
   - Any duplicate entries that shouldn't exist?
   - Any status values that are invalid?
6. Paste EXACT SQL of any trigger or function that might be causing the issue
7. Output: affected tables, columns, triggers, RLS policies, org isolation status, and the EXACT data anomaly if found
```

**Agent 2: "backend-tracer"** — Edge functions + hooks
```
Investigating bug: "<user's description>"

1. Search supabase/functions/ for edge functions that touch the affected tables
   - READ the FULL index.ts of each suspect function — paste EXACT code
   - Check config.toml (verify_jwt should be false)
   - Check _shared/ imports (auth.ts, cors.ts)
2. Search src/hooks/ for React Query hooks that fetch/mutate the affected data
   - READ the FULL hook file — paste EXACT code
   - Check query keys, stale times, error handling
   - Check if the hook calls an edge function or queries Supabase directly
3. Trace the data flow: DB table → edge function → hook → where does it break?
4. Check for common backend bugs:
   - Missing set_config() before writes in edge functions
   - Wrong authenticateRequest role check
   - Missing org_id filter in queries
   - Stale query cache (missing invalidation after mutation)
5. Output: the EXACT code path from DB to frontend, highlighting where the bug likely is
```

**Agent 3: "frontend-tracer"** — Components + pages
```
Investigating bug: "<user's description>"

1. Search src/pages/ and src/components/ for files that render the affected data
   - READ the FULL component file — paste EXACT code
2. Check how the component consumes the hook data:
   - Is it handling loading/error states?
   - Is it accessing the correct property path?
   - Is it filtering/mapping data correctly?
3. Check for common frontend bugs:
   - Optional chaining missing (data?.property)
   - Wrong TypeScript type assertion
   - useEffect dependency array issues
   - Missing key prop in lists
   - Stale closure over state
4. Search for recent changes to these files: use git log on suspect files
5. Output: the EXACT component code that renders the broken UI, highlighting the likely bug
```

---

## Step 4: Identify Root Cause

After agents return, synthesize their findings:

```
ROOT CAUSE REPORT:
─────────────────
Bug:        <one-line description>
Layer:      <DB | edge-function | hook | component | RLS | trigger>
File:       <exact file path and line number>
Code:       <paste the EXACT broken code, 5-20 lines>
Why:        <explain why this code produces the bug>
Fix:        <describe the fix in one sentence>
Risk:       <low | medium | high> — what else could break
```

Present this to the user. If the fix is **high risk** (touches triggers, commissions, or multi-table mutations), ask:
> "This fix touches [critical system]. Want me to proceed, or should we discuss the approach first?"

For **low/medium risk**, proceed directly to Step 5.

---

## Step 5: Implement the Fix

Follow strict implementation order: **DB → edge function → types → hooks → components → pages**

### 5a. Database fixes (if needed)
```
- Write migration SQL with org_id scoping
- Use mcp__supabase__execute_sql to apply (or mcp__supabase__apply_migration)
- Verify: query the fixed data to confirm
```

### 5b. Edge function fixes (if needed)
```
- Edit the function in supabase/functions/<name>/index.ts
- Maintain conventions: verify_jwt=false, _shared imports, set_config before writes
- Deploy: supabase functions deploy <name>
```

### 5c. Frontend fixes (if needed)
```
- Edit hook in src/hooks/
- Edit component in src/components/ or src/pages/
- Import supabase from '@/integrations/sb_client/client'
- Run: cd ~/Peptide\ Inv\ App && npx tsc --noEmit (typecheck)
```

### 5d. After ALL changes
```
- Run: cd ~/Peptide\ Inv\ App && npm run preflight
- Fix any typecheck/lint errors before proceeding
```

---

## Step 6: Verify the Fix

### 6a. Start local dev server
```bash
cd ~/Peptide\ Inv\ App && npm run dev
```
Wait for "Local: http://localhost:4550" in output.

### 6b. Playwright verification (if UI bug)
```
1. mcp__playwright__browser_navigate to http://localhost:4550
2. Log in with credentials
3. Navigate to the previously broken page
4. mcp__playwright__browser_take_screenshot — label "AFTER_FIX"
5. Verify the bug is gone:
   - mcp__playwright__browser_console_messages — no JS errors
   - mcp__playwright__browser_snapshot — correct DOM state
   - Visual comparison: BEFORE_FIX vs AFTER_FIX
```

### 6c. Database verification (if data bug)
```
Use mcp__supabase__execute_sql:
1. Re-run the query that showed the anomaly — confirm it's fixed
2. Check org_id scoping: SELECT COUNT(*) FROM <table> WHERE org_id IS NULL; (should be 0)
3. Check no cross-org leaks: verify data only shows for correct org
4. If trigger was fixed: INSERT a test row and verify trigger fires correctly
```

### 6e. Multi-Org Isolation Gate (MANDATORY — never skip)
```
This is a multi-tenant app. Every fix MUST pass org isolation verification before being called done.
Use mcp__supabase__execute_sql:

1. Confirm affected table has org_id NOT NULL:
   SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name = '<table>' AND column_name = 'org_id';
   — MUST return is_nullable = 'NO'

2. Confirm zero NULL org_ids after fix:
   SELECT COUNT(*) FROM <table> WHERE org_id IS NULL;
   — MUST return 0

3. Confirm RLS is enabled:
   SELECT relrowsecurity FROM pg_class WHERE relname = '<table>';
   — MUST return true

4. Confirm RLS policies scope by org_id:
   SELECT policyname, qual FROM pg_policies WHERE tablename = '<table>';
   — Every policy MUST reference org_id or get_user_org_id()

5. Pick 2 distinct org_ids and verify isolation:
   SELECT COUNT(*) FROM <table> WHERE org_id = '<org_A>'
   AND id IN (SELECT id FROM <table> WHERE org_id = '<org_B>');
   — MUST return 0

6. If the fix touched a hook or edge function, verify org_id is in the query:
   — Grep the changed file for '.eq(' and confirm org_id is filtered

If ANY check fails, the fix is NOT complete. Fix the isolation issue before proceeding.
```

### 6d. Run existing tests
```bash
cd ~/Peptide\ Inv\ App && npm run preflight
```

**Do NOT proceed if any verification fails.** Fix the issue and re-verify.

---

## Step 7: Update Documentation

Update ONLY the files affected by the fix:

```
- .agent/runbook.md — Add new Symptom → Cause → Fix row for this bug
- .agent/decisions-log.jsonl — Append: {"date":"YYYY-MM-DD","decision":"<what was fixed>","reason":"<root cause>","files":["<changed files>"]}
- .agent/schema.sql — Update if DB schema changed
- Section CLAUDE.md files — Update if relevant:
  - src/hooks/CLAUDE.md (if hook changed)
  - supabase/functions/CLAUDE.md (if edge function changed)
  - src/pages/CLAUDE.md (if page changed)
  - src/components/CLAUDE.md (if component changed)
  - supabase/migrations/CLAUDE.md (if migration added)
```

---

## Step 8: Summary Report

Output a final report:

```
DEBUG COMPLETE
══════════════
Bug:        <one-line description>
Root cause: <one sentence>
Fix:        <files changed, one line each>
Verified:   <what was tested — screenshots, queries, preflight>
Docs:       <which .agent/ files were updated>
Deploy:     <"Ready to deploy" or "Deployed edge function X" or "Local only — run /deploy when ready">
```

If the user wants to deploy:
```bash
# 1. Run preflight first — MUST pass before pushing
cd ~/Peptide\ Inv\ App && npm run preflight

# 2. Stage ONLY the changed files (never git add -A — it can include secrets)
git add <file1> <file2> ...

# 3. Commit with descriptive message
git commit -m "fix: <one-line description of bug and fix>"

# 4. Push ONLY after user confirms
git push origin main:master && git push origin main:main
```
**NEVER push without explicit user approval. Ask first.**

---

## Critical Rules

1. **MULTI-ORG ISOLATION IS THE #1 RULE.** This is a multi-tenant app — every tenant's data MUST be invisible to every other tenant. org_id scoping is mandatory on every query, RLS policy, trigger, and edge function. Step 6e is NEVER optional. If you skip it, you ship a data leak.
2. **Always import supabase** from `@/integrations/sb_client/client`
3. **verify_jwt = false** in every edge function config.toml
4. **set_config() must precede writes** in edge functions (same SQL call)
5. **tenant_config: ALWAYS UPDATE, never INSERT**
6. **Never store credentials to disk** — session-only
7. **Read .agent/runbook.md** before proposing changes — the fix might already be documented
8. **Read .agent/conventions.md** for non-obvious patterns
9. **Paste EXACT code** for anything being modified — never summarize
10. **Test locally on http://localhost:4550** before pushing
11. **Do NOT proceed past reproduction** until the bug is confirmed
12. **Do NOT deploy** without the user's explicit approval
13. **No approval gates** — this skill moves fast. Diagnose → fix → verify → done.
14. **If the fix doesn't work**, don't loop. Re-trace from Step 3 with new hypothesis.
