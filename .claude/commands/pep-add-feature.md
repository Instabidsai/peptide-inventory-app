# Deep Audit v3 — Multi-Agent Research, Live Testing & Auto-Documentation

> /pep-add-feature <description of feature or bug>

## Purpose

Before writing a single line of code, launch a team of research agents that audit every layer of the PeptideAI platform affected by the proposed change. Agents read ACTUAL code (not summaries), query the LIVE Supabase database, verify multi-org isolation, enumerate edge cases, and extract reusable patterns from existing features. After implementation, automatically test via Playwright against the live app with real logins across multiple orgs, then update ALL project documentation files so the knowledge base stays current.

## Credentials & Test Config

When the user provides login credentials, store them for the Playwright testing phase:

```
CREDENTIALS (provided by user at invocation time):
- ORG_1: { url, email, password, org_name, role }
- ORG_2: { url, email, password, org_name, role }  (different org for multi-org testing)
- ORG_3: { url, email, password, org_name, role }  (optional: partner/non-admin role)
```

If no credentials are provided, ask the user:
> "To run live Playwright tests across multiple orgs, I need login credentials for at least 2 different organizations (ideally an admin + a non-admin). Please provide: app URL, email, password, and role for each. These are only used in this session and never stored to disk."

---

## How It Works

When this skill is invoked, you MUST follow these steps exactly:

---

### Step 0: Pre-Flight — Query Live Supabase

Before spawning any agents, YOU (the main agent) must query the live database using the Supabase MCP tools to get ground truth. Run these queries yourself:

```
1. Use mcp__supabase__list_tables to get the current live table list
2. For each table the feature likely touches, use mcp__supabase__execute_sql:
   - SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '<table>' ORDER BY ordinal_position;
   - SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = '<table>';
   - SELECT tgname, tgtype, proname FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid WHERE tgrelid = '<table>'::regclass AND NOT tgisinternal;
   - SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<table>';
3. For RPC functions that will be modified:
   - SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '<function_name>';
4. Check live RLS status:
   - SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('<table1>', '<table2>');
5. Check existing data patterns (for edge case discovery):
   - SELECT payment_status, COUNT(*) FROM sales_orders GROUP BY payment_status;
   - SELECT DISTINCT org_id FROM sales_orders LIMIT 20;  -- verify multi-org data exists
```

Save the results. Pass them to agents as "LIVE DB CONTEXT" so they don't guess.

---

### Step 1: Parse the Request

Extract from the user's description:
- **Change type**: `feature` | `bugfix` | `refactor` | `integration`
- **Affected domain(s)**: inventory, orders, commissions, contacts, protocols, health, AI, vendor, client, partner, payments, shipping, self-healing, integrations (woo/shopify/stripe)
- **Key entities**: Which DB tables, edge functions, pages, hooks are likely involved

---

### Step 2: Create the Task List

Create tasks for each research domain. Always include ALL of these:

1. **DB Schema & RLS Audit** — Check affected tables, columns, RLS policies, triggers, and foreign keys
2. **Edge Function Audit** — Check which edge functions read/write affected tables, check _shared/ dependencies
3. **Frontend Audit** — Check pages, components, hooks, and routes that touch affected data
4. **Integration Audit** — Check WooCommerce, Shopify, Stripe, Shippo sync implications
5. **Commission & Trigger Audit** — Check if change touches orders/contacts/profiles (commission triggers are the most fragile system)
6. **Feature Flag & Tenant Config Audit** — Check org_features and tenant_config implications
7. **Self-Healing Audit** — Check if sentinel-worker, health-probe, or circuit breaker are affected
8. **Type & Import Audit** — Check TypeScript types, Zod schemas, and import paths
9. **Caller/Dependency Graph** — Map every caller of functions that will be modified
10. **Test & Spec Audit** — Find existing tests that cover affected code
11. **Edge Case Enumeration** — List every edge case per domain
12. **Pattern Extraction** — Find the closest existing feature and extract its exact code pattern to replicate

---

### Step 3: Spawn Research Agents in Parallel

Launch **5 parallel agents** (using Agent tool with subagent_type="Explore"), each covering specific domains from Step 2.

**CRITICAL INSTRUCTION FOR ALL AGENTS**: When you find a function, hook, component, or SQL function that WILL BE MODIFIED, you MUST paste the EXACT code block (not a summary). Summaries cause implementation mistakes. Paste the full function body.

**Agent 1: "db-researcher"** — Domains 1 + 5 (Schema/RLS + Commissions/Triggers)
```
Research the following for change: "<user's description>"

LIVE DB CONTEXT (from Step 0):
<paste live query results here>

1. DB SCHEMA: Read .agent/schema.sql, then search supabase/migrations/ for ALL migrations touching the affected tables. List every column, FK, index, and trigger.

2. RLS POLICIES: For each affected table:
   - Read ALL RLS policies from migrations (search for "CREATE POLICY" + table name)
   - Cross-reference with the LIVE DB CONTEXT pg_policies output above
   - Flag any discrepancy between migration files and live DB
   - Verify every policy includes org_id scoping

3. COMMISSION TRIGGERS: If the change touches orders, contacts, profiles, or commissions tables:
   - READ THE FULL BODY of process_sale_commission() — paste the ENTIRE function, not a summary
   - READ THE FULL BODY of create_validated_order() — paste the ENTIRE function
   - READ THE FULL BODY of apply_commissions_to_owed() if it exists
   - Document the COMPLETE trigger chain: order insert/update → commission calculation → partner notification
   - List EVERY caller of these functions (search for "process_sale_commission" and "create_validated_order" across ALL files)

4. MULTI-ORG VERIFICATION:
   - For each affected table, verify org_id column exists and is NOT NULL
   - Check that every RLS policy uses get_user_org_id() or equivalent
   - Check that every trigger/function passes org_id through the chain
   - Flag any query that does NOT filter by org_id

5. EDGE CASES — list at least 5:
   - What happens if [amount] exceeds [total]?
   - What happens on a cancelled/refunded order?
   - What happens with concurrent updates (two payments at once)?
   - What happens if the trigger/function fails mid-execution?
   - What happens if org_id is null or mismatched?

6. Output a structured report:
   - Tables affected (with FULL column list)
   - RLS policies (EXACT policy SQL, not summaries)
   - Triggers that fire (EXACT trigger SQL)
   - Foreign key constraints
   - Migration files relevant (with dates)
   - ALL callers of modified functions
   - Edge cases enumerated
   - RISK LEVEL: low/medium/high/critical
```

**Agent 2: "backend-researcher"** — Domains 2 + 7 (Edge Functions + Self-Healing)
```
Research the following for change: "<user's description>"

LIVE DB CONTEXT (from Step 0):
<paste live query results here>

1. EDGE FUNCTIONS: Search supabase/functions/ for any function that reads or writes the affected tables.
   - READ EACH FUNCTION'S FULL index.ts — paste the EXACT code for any function that will be modified
   - Check _shared/auth.ts, _shared/cors.ts, _shared/platform-order-sync.ts patterns
   - Check config.toml for each function (verify_jwt setting, env vars)
   - For each function, list: inputs, outputs, tables touched, RPCs called

2. CALLER GRAPH: For each edge function that will be modified:
   - Search for where it's invoked (frontend fetch calls, webhooks, cron triggers)
   - Search for what RPCs it calls
   - Map the full call chain: caller → function → DB operations → triggers

3. VERCEL API: Search api/ directory for serverless functions touching the same data.

4. SELF-HEALING: Check if sentinel-worker or health-probe monitor the affected tables.
   - READ the relevant sections of sentinel-worker/index.ts — paste EXACT code for affected phases
   - Read specs/self-healing.md
   - Check circuit_breaker_config entries

5. EDGE CASES — list at least 5:
   - What if the edge function times out mid-operation?
   - What if auth fails silently (token expired)?
   - What if the function is called with missing/extra fields?
   - What if a downstream RPC fails but the function already committed partial state?
   - What if two requests hit the same function concurrently for the same order?

6. Output a structured report:
   - Edge functions affected (with FULL code for modified functions)
   - Complete caller graph (who calls what)
   - API routes affected
   - Self-healing implications
   - Auth patterns used (EXACT code)
   - Edge cases enumerated
   - RISK LEVEL: low/medium/high/critical
```

**Agent 3: "frontend-researcher"** — Domains 3 + 6 (Frontend + Feature Flags)
```
Research the following for change: "<user's description>"

1. PAGES & COMPONENTS: Search src/pages/ and src/components/ for files that import or reference the affected tables/hooks.
   - READ each relevant file fully
   - For any component that will be modified, paste the EXACT current code
   - Document: props, state, event handlers, Supabase queries, mutation calls

2. HOOKS: Search src/hooks/ for hooks that query the affected tables.
   - READ each hook file fully
   - Paste EXACT code for hooks that will be modified
   - Document: query keys, select columns, filter conditions, mutation logic, cache invalidation

3. PATTERN EXTRACTION — THIS IS CRITICAL:
   - Find the CLOSEST existing feature to what we're building (e.g., if adding partial payments, find the existing full-payment UI)
   - Paste the EXACT code pattern (component structure, hook usage, dialog pattern, form validation)
   - The new feature MUST follow this same pattern for consistency

4. FEATURE FLAGS: Check src/lib/feature-registry.ts and useOrgFeatures hook.
   - Does this feature need a new flag?
   - Does it interact with existing flags?

5. TENANT CONFIG: Check if tenant_config fields are involved. Remember: ALWAYS UPDATE, never INSERT.

6. ROUTING: Check App.tsx for route definitions that might need updating.

7. EDGE CASES — list at least 5:
   - What if the user double-clicks the submit button?
   - What if they enter invalid data (negative numbers, empty strings)?
   - What if the mutation fails after optimistic update?
   - What if the component unmounts mid-request?
   - What if a non-admin user tries to access this feature?

8. Output a structured report:
   - Pages affected (with EXACT current code for modified components)
   - Components affected (with EXACT current code)
   - Hooks affected (with EXACT current code and query keys)
   - PATTERN TO REPLICATE (the existing feature code to copy)
   - Feature flags involved
   - Tenant config fields
   - Edge cases enumerated
   - RISK LEVEL: low/medium/high/critical
```

**Agent 4: "integration-researcher"** — Domains 4 + 8 (Integrations + Types)
```
Research the following for change: "<user's description>"

1. INTEGRATIONS: Check WooCommerce sync (woo-sync-products, woo-webhook, woo-callback), Shopify sync (shopify-sync-products, shopify-webhook), Stripe (stripe-webhook), and Shippo functions.
   - For each integration that touches affected data, paste the EXACT mapping function code
   - Determine if the change requires syncing data TO external platforms (outbound) or only FROM (inbound)

2. TYPES: Search src/types/ and src/integrations/ for TypeScript type definitions related to the affected entities.
   - Paste EXACT type definitions that will be modified
   - Check Zod schemas in forms and API calls — paste EXACT schemas
   - Check for enums, constants, and status maps (e.g., PAYMENT_STATUS_MAP)

3. ENVIRONMENT: Check .env.example for any new keys needed. Check vercel.json for any config changes.

4. SCRIPTS: Search scripts/ for any migration or setup scripts that might need updating.

5. EDGE CASES — list at least 3:
   - What if an external webhook sends a status we don't recognize?
   - What if types are out of sync between frontend and DB?
   - What if a required env var is missing in production?

6. Output a structured report:
   - External integrations affected (with EXACT mapping code)
   - Type definitions to update (with EXACT current types)
   - Zod schemas to update (with EXACT current schemas)
   - Environment variables needed
   - Edge cases enumerated
   - RISK LEVEL: low/medium/high/critical
```

**Agent 5: "test-researcher"** — Domains 10 + 9 (Tests + Dependency Graph)
```
Research the following for change: "<user's description>"

1. EXISTING TESTS: Search the ENTIRE project for test files:
   - Glob for: **/*.test.ts, **/*.test.tsx, **/*.spec.ts, **/*.spec.tsx, **/tests/**, **/test/**, **/__tests__/**
   - Search for Playwright/Vitest/Jest config files
   - For any test that covers affected code, paste the EXACT test code
   - List which functions/components have ZERO test coverage

2. EDGE FUNCTION TESTS: Check supabase/functions/ for any test files or test scripts.
   - Check package.json for test scripts
   - Check if there are curl/httpie test scripts in scripts/

3. DEPENDENCY GRAPH — Map every caller chain:
   - For each DB function that will be modified: search ALL files for its name
   - For each edge function that will be modified: search ALL files for its URL/name
   - For each hook that will be modified: search ALL files for its import
   - For each component that will be modified: search ALL files for its import
   - Output as: "X is called by Y, which is called by Z"

4. BREAKING CHANGE ANALYSIS:
   - If we add a required column, what existing INSERT statements break?
   - If we change a function signature, what callers break?
   - If we change a type definition, what imports break?
   - If we add a new table, what RLS policies are needed from day 1?

5. Output a structured report:
   - Test files found (with file paths and what they test)
   - Test coverage gaps (what has NO tests)
   - Complete dependency graph (caller → callee chains)
   - Breaking changes identified
   - Suggested test plan for the new feature
   - RISK LEVEL: low/medium/high/critical
```

---

### Step 4: Verify Live DB Against Code (Post-Agent)

After all 5 agents complete, YOU (the main agent) must run verification queries against the live Supabase to confirm agent findings:

```
1. Use mcp__supabase__execute_sql to verify:
   - The exact RLS policies agents reported actually exist
   - The exact triggers agents reported actually exist
   - The exact function bodies agents reported match live DB
   - Run: SELECT proname, prosrc FROM pg_proc WHERE proname IN ('<functions that will be modified>');

2. Check for data that could break the migration:
   - Are there NULL values where we plan to add NOT NULL?
   - Are there duplicate values where we plan to add UNIQUE?
   - How many rows will be affected? (SELECT COUNT(*) for affected tables)

3. Verify multi-org data isolation:
   - SELECT DISTINCT org_id, COUNT(*) FROM <affected_table> GROUP BY org_id;
   - Confirm there are multiple orgs with data (not just one)
   - Confirm no rows have NULL org_id
```

---

### Step 5: Compile the Impact Report

After ALL 5 agents complete AND live DB verification passes, compile findings into:

```markdown
# Impact Report: <change description>

## Risk Assessment
- Overall Risk: <highest risk from any agent>
- Commission System: <affected? yes/no + details>
- Self-Healing: <affected? yes/no + details>
- External Integrations: <affected? yes/no + details>
- Multi-Org Isolation: <verified? yes/no + details>
- Live DB vs Code: <any discrepancies found?>

## Files That MUST Change
| File | Change Required | Exact Lines | Risk |
|------|----------------|-------------|------|
| ... | ... | L123-L145 | ... |

## Files That MIGHT Need Change
| File | Why | Risk |
|------|-----|------|
| ... | ... | ... |

## Database Changes
- [ ] New migration needed? (describe with EXACT SQL)
- [ ] RLS policy changes? (describe with EXACT SQL)
- [ ] Trigger changes? (describe with EXACT SQL)
- [ ] Live data compatibility verified? (row counts, NULL checks)

## Edge Function Changes
- [ ] Functions to modify: (list with caller graph)
- [ ] Functions to create: (list with auth pattern)
- [ ] Shared dependencies affected: (list)

## Frontend Changes
- [ ] Pages to modify: (list)
- [ ] Components to modify: (list)
- [ ] Hooks to modify: (list with query keys to invalidate)
- [ ] New hooks needed: (list)
- [ ] PATTERN TO REPLICATE: <existing feature code reference>

## Integration Impact
- [ ] WooCommerce sync affected?
- [ ] Shopify sync affected?
- [ ] Stripe webhooks affected?
- [ ] Shippo affected?

## Multi-Org Verification
- [ ] All new queries include org_id filter?
- [ ] All new RLS policies scope by org_id?
- [ ] All new triggers pass org_id through?
- [ ] Tested against live multi-org data?

## Edge Cases (ALL must be handled in implementation)
| # | Edge Case | Domain | Handling Strategy |
|---|-----------|--------|-------------------|
| 1 | ... | DB | ... |
| 2 | ... | Frontend | ... |
| ... | ... | ... | ... |

## Breaking Changes
| Change | What Breaks | Fix Required |
|--------|-------------|-------------|
| ... | ... | ... |

## Test Plan
- [ ] Existing tests that must still pass: (list)
- [ ] New tests to write: (list with descriptions)
- [ ] Playwright E2E tests: (list — see Step 8)
- [ ] Manual E2E test steps: (numbered list)

## Dependency Graph (Caller Chains)
<visual caller graph for modified functions>

## Environment & Config
- [ ] New env vars needed?
- [ ] vercel.json changes?
- [ ] Feature flag changes?
- [ ] Supabase secrets needed?

## Implementation Order (DO IN THIS SEQUENCE)
1. Database migration (with EXACT SQL ready to paste)
2. RLS policies (with EXACT SQL)
3. DB function changes (with EXACT SQL)
4. Edge function changes
5. Type definitions
6. Hook changes
7. Component changes
8. Page changes
9. Integration updates
10. Sentinel/health-probe updates
11. Start local dev server — verify build compiles (Step 7B)
12. Playwright E2E tests against localhost (Step 8)
13. Fix any failures, re-test locally
14. Ask user to approve push → commit & deploy (Step 8H)
15. Optional: post-deploy smoke test against production
16. Documentation updates (Step 9)
```

---

### Step 6: Present to User for Approval

Show the compiled report to the user. Ask:
- "Does this impact assessment look correct?"
- "Should I proceed with implementation in this order?"
- Flag any edge cases that need a DESIGN DECISION (e.g., "Should partial payment trigger partial commission?")

Do NOT write any code until the user approves.

---

### Step 7: Implement (After Approval)

Implement in the EXACT order specified in the report. DB first, then backend, then frontend. Never skip steps. After all code is written, proceed to Step 7B.

---

### Step 7B: Start Local Dev Server & Verify Build

Before ANY browser testing, run the app locally. NEVER push untested code to production.

#### PeptideAI Local Dev Setup
```
PROJECT DIR: ~/Peptide Inv App
DEV COMMAND:  cd ~/Peptide\ Inv\ App && npm run dev
LOCAL URL:    http://localhost:4550
LIVE APP:     https://app.thepeptideai.com
```

#### Steps:
```
1. cd to the project directory:
   cd ~/Peptide\ Inv\ App

2. Install dependencies if node_modules is missing:
   npm install

3. Run TypeScript check FIRST to catch compile errors before starting:
   npx tsc --noEmit
   - If errors, fix them NOW. Do not proceed with type errors.

4. Start the local dev server in background:
   npm run dev
   - This runs: vite --port 4550 --strictPort
   - Predev script auto-kills any existing process on port 4550
   - Wait for "Local: http://localhost:4550" to appear

5. Verify the server is running:
   - Use Playwright to navigate to http://localhost:4550
   - Take a screenshot — confirm login page renders
   - If it doesn't load, check terminal for errors

6. LOCAL_URL = http://localhost:4550
   ALL Playwright tests in Step 8 use this URL, NOT https://app.thepeptideai.com
```

#### Quick Fix Loop (if build fails):
```
While build errors exist:
  1. Read the error message
  2. Fix the file
  3. Vite hot-reloads automatically (no restart needed for most changes)
  4. If Vite crashes, restart: npm run dev
  5. Verify fix via Playwright screenshot
```

**CRITICAL**: The local dev server connects to the SAME Supabase database (via .env or .env.local), so data changes are real — but code changes are LOCAL ONLY until you push. This means:
- UI changes are instant (Vite HMR) — no deploy needed to test
- DB migrations already applied to real database in Step 7
- Edge function changes need `supabase functions deploy <name>` (they run on Supabase, not locally)
- If something breaks, fix it locally → Vite hot-reloads → re-test → no broken production

#### Available Test Commands (run after Playwright tests if needed):
```
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright E2E tests (if test files exist)
npm run typecheck         # TypeScript check (tsc --noEmit)
npm run lint              # ESLint
npm run preflight         # Full pre-deploy check: typecheck + lint + circular deps + build
```

---

### Step 8: Playwright Testing Against Local Dev Server

After the local dev server is running and building cleanly, run Playwright tests against `LOCAL_URL` (NOT production). This is NOT optional — every feature must be browser-tested before being called done.

**Use the Playwright MCP tools** (mcp__playwright__browser_navigate, mcp__playwright__browser_click, mcp__playwright__browser_fill_form, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_snapshot, etc.)

**IMPORTANT**: All browser_navigate calls use the LOCAL_URL (e.g., http://localhost:3000), not the production Vercel URL. The user-provided credentials still work because auth goes through Supabase (same database).

#### 8A: Determine Which Roles Need Testing

Before logging in, analyze the impact report to decide which credentials are needed:

```
For each credential provided (admin, customer, partner, etc.):
1. Check: Does this feature have ANY UI, data, or behavior visible to this role?
2. Check: Does this role interact with the feature (view, create, edit, or get blocked)?
3. Check: Does the RLS/permission model need to be verified for this role?

ONLY test roles that are RELEVANT to the feature built. Examples:
- Admin-only feature (e.g., record payments) → Test admin. Skip customer/partner UNLESS
  they should see the RESULT (e.g., partner sees updated commission from a payment).
- Customer-facing feature (e.g., payment portal) → Test customer + admin.
- Multi-role feature (e.g., order view with role-based sections) → Test all relevant roles.
- Permission boundary feature → Test the role that SHOULD be blocked to confirm they are.

Output: "Testing roles: [admin, partner] — Skipping [customer] because <reason>"
```

#### 8B: Test Setup
```
1. Use mcp__playwright__browser_navigate to go to LOCAL_URL (e.g., http://localhost:3000)
2. Take a screenshot to confirm the login page loads
3. Use mcp__playwright__browser_fill_form to enter email + password for the first relevant role
4. Click the login button
5. Take a screenshot to confirm successful login
6. Navigate to the feature area being tested
   - If the page shows errors or doesn't render, check the dev server terminal for errors
   - Fix any runtime errors before continuing tests
```

#### 8C: Happy Path Test (Primary Role)
```
For each NEW or MODIFIED user flow:
1. Navigate to the page
2. Take a "before" screenshot
3. Perform the action (click button, fill form, submit)
4. Take an "after" screenshot
5. Verify the expected result:
   - Use browser_snapshot to check DOM state
   - Navigate to related pages to confirm data propagated
   - Check that status badges/labels updated correctly
6. Log: PASS or FAIL + screenshot path
```

#### 8D: Secondary Role Tests (Only If Relevant Per 8A)
```
For each additional role identified in 8A:
1. Log out (or open new browser context)
2. Log in as the next relevant role
3. Test ONLY what that role should see or do with this feature:
   - If they should SEE data → verify it appears correctly
   - If they should be BLOCKED → verify they cannot access/modify
   - If they should see a RESULT (e.g., commission update) → verify it propagated
4. Take screenshots at each verification step
5. Log: PASS or FAIL + screenshot path

Skip roles that have NO interaction with this feature. Document why each was tested or skipped.
```

#### 8E: Edge Case Tests (Browser)
```
For each edge case from the impact report that can be tested via UI:
1. Attempt the edge case scenario (e.g., submit negative number, double-click, empty form)
2. Take a screenshot of the result
3. Verify graceful handling (error toast, validation message, no crash)
4. Log: PASS or FAIL + screenshot path
```

#### 8F: Database Verification (Post-Test)
```
After Playwright tests, use mcp__supabase__execute_sql to verify:
1. Data created during tests exists with correct org_id
2. No cross-org data leaked
3. Triggers fired correctly (check commission records if applicable)
4. Payment status / calculated fields are correct
5. RLS prevents unauthorized access:
   - SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claims = '{"sub":"<org2_user_id>"}';
   - SELECT * FROM <table> WHERE org_id = '<org1_id>';  -- should return 0 rows
```

#### 8G: Test Report
```markdown
# Playwright Test Results: <feature name>

## Summary
- Total tests: X
- Passed: X
- Failed: X
- Screenshots: (list paths)

## Roles Tested (and why)
| Role | Tested? | Reason |
|------|---------|--------|
| admin | YES | Primary user of this feature |
| customer | SKIPPED | No customer-facing UI for this feature |
| partner | YES | Verifies commission updates propagate |

## Happy Path (Primary Role)
| Test | Action | Expected | Actual | Status | Screenshot |
|------|--------|----------|--------|--------|------------|
| ... | ... | ... | ... | PASS/FAIL | path |

## Secondary Role Tests
| Test | Role | What Was Verified | Status | Screenshot |
|------|------|-------------------|--------|------------|
| ... | ... | ... | PASS/FAIL | path |

## Edge Cases
| Edge Case | Result | Status | Screenshot |
|-----------|--------|--------|------------|
| ... | ... | PASS/FAIL | path |

## DB Verification
| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| ... | ... | ... | PASS/FAIL |
```

If ANY test fails, fix the code locally and re-run the failed tests. Repeat until all pass.

---

### Step 8H: Deploy Gate — Push Only After All Local Tests Pass

```
ONLY after ALL Playwright tests pass on http://localhost:4550:

1. Run the preflight check:
   cd ~/Peptide\ Inv\ App && npm run preflight
   This runs: typecheck → lint → circular dependency check → production build
   If preflight fails, fix errors and re-run before proceeding.

2. Stop the local dev server (Ctrl+C or kill the background process)

3. Ask the user: "All local tests + preflight passed. Ready to commit and push to deploy?"
   - If YES → proceed to step 4
   - If NO → leave changes uncommitted for user to review

4. If pushing:
   - git add <only the files changed for this feature — never add .env or secrets>
   - git commit with descriptive message
   - git push origin main:master && git push origin main:main  (deploys to Vercel)
   - OR use: npm run deploy (runs the project's deploy script with tests + migrations)
   - OR use: npm run deploy:quick (skips tests if they already passed locally)

5. OPTIONAL post-deploy smoke test:
   - After Vercel deploy finishes, run ONE quick Playwright test against https://app.thepeptideai.com
   - Just the happy path — confirm the feature loads and works in production
   - Take a screenshot as proof
```

**NEVER push code that hasn't passed local Playwright tests + preflight first.**

---

### Step 9: Auto-Update Project Documentation

After ALL tests pass, update every relevant documentation file to reflect the change. This keeps the project's knowledge base current so future sessions (and future agents) have accurate context.

#### 9A: Update `.agent/schema.sql`
```
- Regenerate the consolidated schema snapshot
- Use mcp__supabase__execute_sql to dump the current schema:
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
- Update .agent/schema.sql with any new tables, columns, triggers, functions, and RLS policies added
- Include comments marking what was added and when
```

#### 9B: Update `.agent/runbook.md`
```
Add new entries to the Symptom → Cause → Fix table for:
- Any new failure modes introduced by this feature
- Edge cases that were found and handled
- Common mistakes future developers might make with this feature
Example format:
| Symptom | Cause | Fix |
|---------|-------|-----|
| Partial payment not updating status | Trigger not firing | Check order_payments trigger exists: SELECT * FROM pg_trigger WHERE tgrelid = 'order_payments'::regclass |
```

#### 9C: Update `.agent/decisions-log.jsonl`
```
Append a new line documenting WHY decisions were made:
{"date":"2026-03-06","feature":"partial-payments","decision":"Used order_payments table instead of JSONB column","reason":"Audit trail needs individual records for compliance; JSONB harder to query and index","alternatives_considered":["JSONB payment_breakdown column","Separate payment_transactions table"],"risk":"low"}
{"date":"2026-03-06","feature":"partial-payments","decision":"Commission recalculates on payment via trigger","reason":"Idempotency guard in process_sale_commission prevented re-runs; trigger approach ensures atomicity","alternatives_considered":["Frontend-triggered RPC","Cron-based reconciliation"],"risk":"medium"}
```

#### 9D: Update `.agent/conventions.md`
```
Add any NEW non-obvious patterns introduced by this feature:
- New hook patterns (query keys, cache invalidation)
- New component patterns (dialog structure, form validation)
- New DB patterns (trigger chains, RPC conventions)
- New edge function patterns (auth, error handling)
Example:
## Partial Payment Recording Pattern
- Always insert into `order_payments` first — trigger auto-updates `sales_orders.amount_paid` and `payment_status`
- Never update `sales_orders.amount_paid` directly — use the trigger
- Commission recalculation happens automatically via `recalculate_order_commissions()` trigger function
- Query key for payment history: `['order-payments', orderId]`
```

#### 9E: Update `.agent/scope.md`
```
If this feature changes what the project does or does NOT do, update scope.md:
- Add new capabilities (e.g., "Supports partial payment recording from order and contact views")
- Update boundaries (e.g., "Partial payments are admin/staff only — partners cannot record payments")
- Remove outdated limitations
```

#### 9F: Update Project `CLAUDE.md`
```
If the feature introduces:
- New build/test commands → add to CLAUDE.md
- New architectural decisions → add to CLAUDE.md
- New gotchas for future developers → add to CLAUDE.md
- New edge functions or pages → add to relevant section
Keep CLAUDE.md under 150 lines. Move details to .agent/ files and reference them.
```

#### 9G: Update `scripts/schema-master.sql` (if it exists)
```
If the project has a master schema script, regenerate it to include:
- New tables with all columns, constraints, defaults
- New RLS policies
- New triggers and functions
- New indexes
This is the "single source of truth" for the DB schema.
```

#### 9H: Update Section CLAUDE.md Files
```
If the feature adds/modifies hooks, pages, components, scripts, or migrations,
update the corresponding section CLAUDE.md file:
- src/CLAUDE.md — Frontend architecture overview (update if new directories or patterns)
- src/hooks/CLAUDE.md — Hook catalog table (add new hooks with query keys, tables, mutations)
- src/pages/CLAUDE.md — Route map (add new pages with route, role, key hooks)
- src/components/CLAUDE.md — Component directory map (add new components, update file counts)
- scripts/CLAUDE.md — Script catalog (add new scripts with purpose and category)
- supabase/migrations/CLAUDE.md — Migration timeline (add new migrations to recent list)
- supabase/functions/CLAUDE.md — Edge function catalog (add/update function entries)
Keep each section file under its line limit. These files help future AI sessions navigate fast.
```

#### 9I: Documentation Update Checklist
```markdown
## Documentation Updates Completed
- [ ] .agent/schema.sql — Updated with new tables/columns/triggers
- [ ] .agent/runbook.md — Added failure modes and debugging steps
- [ ] .agent/decisions-log.jsonl — Appended WHY decisions
- [ ] .agent/conventions.md — Added new patterns
- [ ] .agent/scope.md — Updated capabilities/boundaries
- [ ] CLAUDE.md — Updated if needed (kept under 150 lines)
- [ ] scripts/schema-master.sql — Regenerated if exists
- [ ] Section CLAUDE.md files — Updated for any new hooks/pages/components/scripts/migrations
```

---

### Step 10: Final Summary to User

Present the complete results:

```markdown
# Feature Complete: <feature name>

## Implementation
- Files created: X
- Files modified: X
- Database migrations: X
- Edge functions: X created, X modified

## Test Results
- Playwright tests: X/X passed
- Multi-org isolation: VERIFIED
- Permission tests: VERIFIED
- Edge cases tested: X/X passed
- DB verification: VERIFIED

## Documentation Updated
- .agent/schema.sql ✓
- .agent/runbook.md ✓
- .agent/decisions-log.jsonl ✓
- .agent/conventions.md ✓
- .agent/scope.md ✓
- CLAUDE.md ✓

## Screenshots
<list of screenshot paths from Playwright tests>

## Known Limitations
<anything that couldn't be fully tested or needs follow-up>
```

---

## Critical Rules

1. **NEVER skip an agent.** All 5 must run, even if you think a domain isn't affected. Surprises hide in the domains you skip.
2. **Paste EXACT code, not summaries.** Agents must paste the full function body for anything that will be modified. Summaries cause implementation mistakes on complex functions.
3. **Query live Supabase.** Use MCP tools (mcp__supabase__execute_sql, mcp__supabase__list_tables) to verify schema, RLS, triggers, and data patterns against the actual production database. Never trust migration files alone — they may have been modified manually.
4. **Check .agent/runbook.md** for known high-risk operations before proposing changes.
5. **Check .agent/conventions.md** for non-obvious patterns (set_config, tenant_config UPDATE-only, verify_jwt=false, etc.).
6. **Commission system is the most fragile.** Any change touching orders, contacts, or profiles MUST document the COMPLETE commission trigger chain with EXACT function bodies.
7. **MULTI-ORG ISOLATION IS THE #1 RULE.** This is a multi-tenant app — every tenant's data MUST be invisible to every other tenant. Every new query, RLS policy, trigger, hook, and edge function must include org_id filtering. The audit MUST verify against LIVE data that: (a) no NULL org_ids exist, (b) RLS is enabled, (c) policies scope by org_id, (d) Org A cannot see Org B data. If ANY check fails, the feature is NOT complete — fix isolation before moving on.
8. **Extract and replicate patterns.** Find the closest existing feature and use its exact code pattern. Do not invent new patterns when existing ones work.
9. **Enumerate edge cases.** Each agent must list at least 3-5 edge cases. The final report must include handling strategies for ALL of them.
10. **Map the caller graph.** Before modifying any function, know EVERY caller. Changing a function signature without updating all callers = broken deploy.
11. **After approval, implement in the exact order specified** in the report. DB first, then backend, then frontend. Never skip steps.
12. **Verify no breaking changes.** Check for NULL columns, missing defaults, type mismatches, and orphaned references before writing migration SQL.
13. **Playwright testing is NOT optional.** Every feature must be browser-tested before being called done. Test ONLY the roles that are relevant to the feature — don't waste time logging in as a customer if the feature is admin-only. But DO test any role that should see a RESULT of the feature (e.g., partner seeing updated commissions). Take screenshots at every step.
14. **Documentation updates are NOT optional.** Every feature must update .agent/ files and CLAUDE.md before being called done. Future sessions depend on accurate docs.
15. **Never store credentials to disk.** User-provided logins are used in-session only for Playwright testing. Never write them to any file, memory, or log.
