# PeptideAI Master Audit Checklist — Every Possible Thing to Check

> This is NOT a skill. This is the reference checklist used BY skills.
> When /make-skill builds a new skill, it pulls relevant items from this list.

---

## 1. DATABASE (57 tables, 153 migrations)

### Schema
- [ ] Table exists with correct columns, types, and defaults
- [ ] Primary key is `id uuid DEFAULT gen_random_uuid()`
- [ ] `org_id uuid NOT NULL` exists and has FK to organizations
- [ ] `created_at timestamptz DEFAULT now()` exists
- [ ] `updated_at timestamptz DEFAULT now()` exists (if mutable)
- [ ] All foreign keys have correct ON DELETE behavior (CASCADE vs SET NULL vs RESTRICT)
- [ ] Indexes exist for frequently queried columns (org_id, status, created_at)
- [ ] CHECK constraints for enum-like text fields
- [ ] No orphaned columns from old features

### RLS (Row Level Security)
- [ ] RLS is ENABLED on the table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] SELECT policy scoped by `org_id = get_user_org_id(auth.uid())`
- [ ] INSERT policy has WITH CHECK for org_id
- [ ] UPDATE policy scoped by org_id + role check (admin/staff)
- [ ] DELETE policy scoped by org_id + admin only (if applicable)
- [ ] No policy uses `USING (true)` — that's a security hole
- [ ] Policies tested: user in Org A cannot see Org B data
- [ ] Service role bypasses RLS where needed (edge functions)

### Triggers & Functions
- [ ] Triggers fire on correct events (INSERT/UPDATE/DELETE)
- [ ] Trigger functions handle NULL values gracefully
- [ ] Trigger functions are idempotent (safe to re-run)
- [ ] No infinite trigger loops (trigger A fires trigger B fires trigger A)
- [ ] Functions use SECURITY DEFINER only when necessary
- [ ] Functions pass org_id through the entire chain
- [ ] RPC functions are exposed only to correct roles

### Migrations
- [ ] Migration is idempotent (uses IF NOT EXISTS, IF EXISTS)
- [ ] Migration handles existing data (no NOT NULL on populated columns without DEFAULT)
- [ ] Migration doesn't break existing queries (no column renames without aliases)
- [ ] Migration tested against live data (NULL checks, duplicate checks)
- [ ] Rollback plan documented if migration fails

### Live DB Verification
- [ ] Live schema matches migration files (no manual changes)
- [ ] No NULL org_id values in any table
- [ ] No orphaned records (FK violations)
- [ ] Row counts are reasonable (no accidental mass deletes)
- [ ] Triggers exist in live DB (pg_trigger check)
- [ ] Functions exist in live DB (pg_proc check)

---

## 2. EDGE FUNCTIONS (49 functions)

### Code Quality
- [ ] Imports from `_shared/auth.ts` (not custom auth)
- [ ] Imports from `_shared/cors.ts` (not custom CORS)
- [ ] `config.toml` exists with `verify_jwt = false`
- [ ] Uses `authenticate(req)` for auth (not raw JWT parsing)
- [ ] All DB queries scoped by `orgId` from authenticate()
- [ ] Uses `set_config('app.current_org_id', orgId)` before writes
- [ ] Error responses include CORS headers
- [ ] OPTIONS request handled for CORS preflight
- [ ] No hardcoded secrets (uses Deno.env.get())
- [ ] No console.log with sensitive data

### Business Logic
- [ ] Input validation (required fields, types, ranges)
- [ ] Handles missing/null input gracefully
- [ ] Returns appropriate HTTP status codes (200, 400, 401, 403, 404, 500)
- [ ] Idempotent where possible (safe to retry)
- [ ] Timeout handling for long operations
- [ ] No partial state on error (transaction or rollback)

### Deployment
- [ ] Function deploys successfully: `supabase functions deploy <name>`
- [ ] Function responds to HTTP request after deploy
- [ ] Environment variables set in Supabase dashboard
- [ ] Cron schedule correct (if scheduled function)

---

## 3. FRONTEND (665 files, 132K lines)

### Pages (102)
- [ ] Route registered in App.tsx
- [ ] Page loads without console errors
- [ ] Page handles loading state (skeleton/spinner)
- [ ] Page handles empty state (no data yet)
- [ ] Page handles error state (API failure)
- [ ] Page is responsive (mobile + desktop)
- [ ] Page respects user role (admin vs staff vs partner)
- [ ] Page title updates via document.title or helmet
- [ ] Breadcrumbs/navigation correct

### Components (179)
- [ ] Props are typed (TypeScript interface)
- [ ] Component handles missing/null props
- [ ] Loading states shown during async operations
- [ ] Error boundaries catch component crashes
- [ ] No direct Supabase calls — use hooks
- [ ] Accessible (keyboard nav, aria labels, screen reader)
- [ ] No inline styles (use tailwind/shadcn)
- [ ] Follows existing component patterns in the codebase

### Hooks (77)
- [ ] Query key is unique and includes all dependencies (orgId, id, filters)
- [ ] Select clause fetches only needed columns (not `*`)
- [ ] Query includes `.eq('org_id', orgId)` filter
- [ ] Mutation invalidates correct query keys on success
- [ ] Mutation handles optimistic updates correctly (rollback on error)
- [ ] Error handling with toast notifications
- [ ] Stale time / cache time appropriate for data type
- [ ] No race conditions with concurrent mutations

### Forms & Validation
- [ ] Zod schema validates all fields
- [ ] Required fields marked in UI
- [ ] Error messages shown per-field (not just toast)
- [ ] Submit button disabled during submission (prevent double-click)
- [ ] Form resets after successful submission
- [ ] Handles server-side validation errors

### State Management
- [ ] Uses TanStack Query for server state (not useState)
- [ ] Uses useState/useReducer for UI state only
- [ ] No stale closures in callbacks
- [ ] Cleanup on unmount (abort controllers, subscriptions)

### Types
- [ ] TypeScript types match DB schema
- [ ] No `any` types (use proper interfaces)
- [ ] Zod schemas match TypeScript types
- [ ] Enum values match DB CHECK constraints
- [ ] Status badge maps cover all possible values

---

## 4. INTEGRATIONS (8 external services)

### WooCommerce
- [ ] woo-webhook receives and processes all event types
- [ ] mapWooPaymentStatus handles all WooCommerce statuses
- [ ] Product sync maps WooCommerce fields → peptides table
- [ ] Customer sync deduplicates by email (case-insensitive)
- [ ] Discount code sync creates/updates/deletes correctly
- [ ] OAuth flow completes without errors

### Shopify
- [ ] shopify-webhook receives order/product events
- [ ] mapShopifyPaymentStatus handles partially_paid
- [ ] Composio OAuth registers webhooks automatically
- [ ] Product sync handles variants
- [ ] Customer sync deduplicates by email

### Stripe
- [ ] stripe_account_id in tenant_config
- [ ] Webhook signature verified
- [ ] Subscription status tracked
- [ ] Payment intents handled

### Shippo
- [ ] Shipping rates calculated correctly
- [ ] Label generation works
- [ ] Tracking updates received

### NMI (Payment Processing)
- [ ] Card tokenization via Collect.js
- [ ] Settlement webhooks update payment status
- [ ] Pool transactions tracked

### OpenAI / Anthropic
- [ ] API keys in Supabase secrets
- [ ] Token limits respected
- [ ] Error handling for rate limits
- [ ] Streaming responses work

---

## 5. COMMISSION SYSTEM (Most Fragile)

- [ ] process_sale_commission() handles all tiers (direct, parent, grandparent)
- [ ] Commission rate sourced from profile at time of order (not current rate)
- [ ] Commissions split correctly: paid portion → 'available', unpaid → 'pending'
- [ ] Commission recalculation is idempotent (no double-counting)
- [ ] apply_commissions_to_owed() correctly offsets partner debts
- [ ] Partner notification fires on commission creation
- [ ] Commission amounts are positive (no negative commissions)
- [ ] Cancelled orders delete associated commissions (CASCADE)
- [ ] Commissions scoped by org_id
- [ ] Partner portal shows correct commission breakdown

---

## 6. SELF-HEALING SYSTEM (17 phases)

- [ ] sentinel-worker runs every 2 minutes
- [ ] health-probe runs every 5 minutes
- [ ] health-digest sends daily summary at 7 AM
- [ ] meta-sentinel monitors sentinel-worker itself
- [ ] Circuit breakers trip at correct thresholds
- [ ] Auto-rollback triggers on boot-failure detection
- [ ] synthetic-monitor verifies content integrity
- [ ] All phases have timeout protection
- [ ] Phase failures don't crash the entire sentinel run
- [ ] Alerts reach admin (email/SMS/Telegram)

---

## 7. MULTI-TENANCY

- [ ] Every table has org_id column (NOT NULL)
- [ ] Every query includes .eq('org_id', orgId)
- [ ] Every RLS policy scopes by org_id
- [ ] Every edge function extracts orgId from auth
- [ ] Every trigger passes org_id through
- [ ] No global queries without org_id filter (except vendor role)
- [ ] Vendor role can see ALL orgs (intentional)
- [ ] tenant_config: one row per org, UPDATE only
- [ ] org_features: correct defaults per subscription tier
- [ ] Data isolation verified: Org A query returns 0 rows from Org B

---

## 8. AUTH & ROLES (5 roles)

- [ ] admin: full org access
- [ ] staff: operational access (inventory, orders, contacts)
- [ ] sales_rep: partner portal (own orders, clients, commissions, downline)
- [ ] customer: client portal (protocols, store, health tracking)
- [ ] vendor: super-admin (ALL orgs — PureUSPeptide only)
- [ ] Role checked at: RLS policy level, edge function level, frontend route level
- [ ] No role escalation possible (customer can't access admin routes)
- [ ] JWT refresh doesn't cause auth failures (verify_jwt=false handles this)
- [ ] Logout clears all session state

---

## 9. TESTING

### Unit Tests (Vitest)
- [ ] `npm run test` passes
- [ ] Critical business logic has test coverage
- [ ] Hook query patterns tested
- [ ] Utility functions tested

### E2E Tests (Playwright)
- [ ] `npm run test:e2e` passes
- [ ] Login flow tested for each role
- [ ] Critical user journeys covered
- [ ] Screenshots captured for visual verification

### Type Checking
- [ ] `npm run typecheck` (tsc --noEmit) passes
- [ ] No implicit `any` types
- [ ] No unused variables/imports

### Linting
- [ ] `npm run lint` passes
- [ ] No ESLint warnings in modified files

### Circular Dependencies
- [ ] `npm run cycles` returns clean (madge)

### Preflight
- [ ] `npm run preflight` passes (typecheck + lint + cycles + build)

---

## 10. DEPLOYMENT

- [ ] Code committed to git (no uncommitted changes)
- [ ] No secrets in committed files (.env in .gitignore)
- [ ] Preflight passes locally
- [ ] Edge functions deployed: `supabase functions deploy`
- [ ] Migrations applied: `npm run deploy` or manual
- [ ] Vercel deployment successful
- [ ] Production smoke test passes (Playwright against live URL)
- [ ] No Sentry errors after deploy
- [ ] Rollback plan ready if something breaks

---

## 11. DOCUMENTATION

- [ ] CLAUDE.md (root) updated if architecture changed
- [ ] .agent/schema.sql matches live DB
- [ ] .agent/runbook.md has new failure modes
- [ ] .agent/decisions-log.jsonl has WHY entries
- [ ] .agent/conventions.md has new patterns
- [ ] .agent/scope.md has updated capabilities/boundaries
- [ ] specs/*.md updated if system behavior changed
- [ ] supabase/functions/CLAUDE.md updated if functions added/changed
- [ ] Section CLAUDE.md files exist for major directories

---

## 12. PERFORMANCE

- [ ] No N+1 queries (batch fetches where possible)
- [ ] Large lists paginated (not fetching all rows)
- [ ] Images optimized (WebP, lazy loading)
- [ ] Bundle size reasonable (check with `npm run build`)
- [ ] No memory leaks (cleanup on unmount)
- [ ] Database queries use indexes
- [ ] Edge functions respond within 10 seconds

---

## 13. SECURITY

- [ ] No XSS vulnerabilities (user input sanitized with DOMPurify)
- [ ] No SQL injection (using parameterized queries via Supabase client)
- [ ] No CSRF (Supabase handles via JWT)
- [ ] RLS prevents unauthorized data access
- [ ] Secrets not in code (use env vars / Supabase secrets)
- [ ] CORS configured correctly (not wildcard in production)
- [ ] Rate limiting on public endpoints
- [ ] File uploads validated (type, size)

---

## HOW SKILLS USE THIS CHECKLIST

Each skill pulls the relevant sections:

| Skill | Sections Used |
|-------|--------------|
| `/add-feature` | ALL (1-13) |
| `/debug` | 1, 2, 5, 6, 7, 8 |
| `/deploy` | 9, 10, 11 |
| `/refactor` | 1, 2, 3, 7, 9, 11 |
| `/health-check` | 1, 2, 4, 5, 6, 7, 8, 12, 13 |
| `/onboard-org` | 7, 8, 11 |
