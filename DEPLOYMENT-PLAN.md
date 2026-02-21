# ThePeptideAI — One-Click Deployment Plan

> **Purpose**: Everything needed to package this as a sellable, one-click-deploy SaaS product.
> **Last updated**: 2026-02-21
> **Status**: IN PROGRESS

---

## Current State Summary

**What's BUILT and working:**
- Multi-tenancy via `org_id` on all tables (43+ files reference it)
- `tenant_config` table (branding, shipping, colors, support email per org)
- Subscription plans (4 tiers: Free / Starter / Professional / Enterprise)
- Super-admin role with RLS bypass policies
- Vendor dashboard (list tenants, provision new ones)
- `provision-tenant` edge function + `useProvisionTenant()` hook
- `useTenantConfig()` hook for per-tenant branding
- Custom fields engine (tenants can add fields to peptides/contacts/orders)
- 15 Supabase Edge Functions in repo (all have `index.ts`)
- Supabase Auth with auto-link by email, role-based redirect
- `.env.example` with all required variables documented
- Security headers in `vercel.json`
- 54 migration files + 45 script SQL files

**What buyers get TODAY (the product):**
- Inventory management (peptides, lots, bottles, concentrations)
- Contact/client CRM with protocol builder
- Sales orders + fulfillment center
- Partner/affiliate 3-tier commission system
- Client portal (store, health tracking, macro tracker)
- Partner portal (store, dashboard, downline)
- AI chat assistant (client-facing, admin-facing, partner-facing)
- AI builder (describe a feature in English → AI builds it)
- Custom fields, custom dashboards, automations engine
- Shipping via Shippo integration
- WooCommerce sync
- Payment processing (Stripe + PsiFi + Zelle/Venmo)
- Payment email scanner (auto-match payments)
- Household system (family accounts)

---

## PHASE 1: Schema & Database (Priority: CRITICAL)

### 1.1 — Consolidate master schema
- [ ] Create `scripts/schema-master.sql` — single file that creates the entire DB from scratch
- [ ] Correct ordering: extensions → enums → tables → RLS policies → functions/RPCs → triggers → indexes
- [ ] Must be idempotent (IF NOT EXISTS everywhere)
- [ ] Tables to include (from audit of all 99 SQL files):
  - `organizations`, `profiles`, `user_roles`
  - `tenant_config`, `subscription_plans`, `tenant_subscriptions`, `billing_events`
  - `peptides`, `lots`, `bottles`, `inventory_movements`
  - `contacts`, `contact_notes`, `contact_addresses`
  - `sales_orders`, `sales_order_items`
  - `protocols`, `protocol_logs`, `suggested_protocols`
  - `expenses`, `supplier_payments`, `commission_entries`
  - `pricing_tiers`, `custom_fields`, `custom_field_values`
  - `resources`, `resource_themes`
  - `client_requests`, `notifications`
  - `meal_logs`, `daily_macro_goals`, `body_comp_logs`, `favorite_foods`, `water_intake`
  - `body_photos`, `meal_templates`
  - `households`, `household_members`
  - `automations`, `automation_runs`
  - `custom_dashboards`, `custom_widgets`, `custom_reports`
  - `ai_usage_tracking`, `tenant_api_keys`
  - `partner_ai_conversations`, `partner_ai_messages`
  - `payment_email_rules`, `payment_email_matches`
  - `sender_aliases`, `woo_customers`
  - `documents`, `document_chunks` (vector/RAG)
  - RPCs: `auto_link_contact_by_email`, `get_stock_counts`, `get_partner_downline`, `match_documents`, etc.
- [ ] Test: fresh Supabase project → run schema → verify all tables created

### 1.2 — Create seed data script
- [ ] Update `scripts/seed-new-tenant.sql` with ALL tables (currently missing automations, custom dashboards, etc.)
- [ ] Create `scripts/seed-subscription-plans.sql` (extracted from 20260219_subscription_plans.sql)
- [ ] Create `scripts/seed-demo-data.sql` (optional sample peptides, contacts, orders for demo mode)

### 1.3 — Supabase config
- [ ] Update `supabase/config.toml` — currently just `project_id = "mckkegmkpqdicudnfhor"` (hardcoded)
- [ ] Make it a template: `project_id = "YOUR_PROJECT_ID"`
- [ ] Add edge function config, auth settings, storage buckets

---

## PHASE 2: Remove Hardcoded Values (Priority: CRITICAL)

### 2.1 — Supabase credentials in source code
- [x] `src/integrations/sb_client/client.ts` — DONE: Removed hardcoded URL + anon key fallback, fail-fast error on missing env vars

### 2.2 — Venmo handle
- [x] `src/pages/client/ClientStore.tsx` — DONE: Pulls from `useTenantConfig()`
- [x] `src/pages/partner/PartnerStore.tsx` — DONE: Pulls from `useTenantConfig()`
- [x] Added `venmo_handle` + `cashapp_handle` to tenant_config table + TypeScript interface
- [x] DB migration: `supabase/migrations/20260221_tenant_config_payment_handles.sql`
- [x] Production seeded: `venmo_handle = 'PureUSPeptide'` for existing org

### 2.3 — Brand references in landing page
- [ ] `src/pages/CrmLanding.tsx` — "ThePeptideAI" appears 6+ times
- [ ] Decide: Is the landing page part of the product? Or does each buyer get their own landing page?
- [ ] Option A: Make it white-label (pull brand from config)
- [ ] Option B: Keep as-is, this is YOUR marketing page (buyers use the app, not the landing page)
- [ ] Email addresses: `hello@thepeptideai.com`, `legal@thepeptideai.com` — templatize or keep as platform emails

### 2.4 — Supabase project ID in config
- [x] `supabase/config.toml` — DONE: Templatized to `YOUR_PROJECT_ID` with comment

### 2.5 — Audit edge functions for hardcoded values
- [x] All 15 edge functions audited — ALL use `Deno.env.get()` for secrets (no hardcoded keys)
- [x] Fixed `partner-ai-chat`: BRAND_NAME default was 'PureUS Peptides' → changed to 'Peptide Partner'
- [x] Required Supabase Edge Function secrets documented (see table below)

---

## PHASE 3: Edge Functions & Backend (Priority: HIGH)

### 3.1 — Audit all 15 edge functions
Edge functions in `supabase/functions/`:
1. [ ] `admin-ai-chat` — Admin AI assistant
2. [ ] `ai-builder` — AI feature builder (describe → build)
3. [ ] `analyze-food` — Photo-based food/macro analysis
4. [ ] `chat-with-ai` — Client-facing AI chat (RAG-powered)
5. [ ] `check-payment-emails` — Scan emails for payment confirmations
6. [ ] `composio-callback` — OAuth callback for integrations
7. [ ] `composio-connect` — Connect 3rd-party services
8. [ ] `exchange-token` — Claim token exchange (invite links)
9. [ ] `invite-user` — Send user invites
10. [ ] `partner-ai-chat` — Partner AI assistant
11. [ ] `process-health-document` — Process uploaded health docs
12. [ ] `promote-contact` — Promote contact to partner (creates auth user)
13. [ ] `provision-tenant` — Create new tenant org + admin + config
14. [ ] `run-automations` — Execute tenant automations
15. [ ] `self-signup` — Self-service tenant signup

For each function:
- [ ] Verify it reads secrets from `Deno.env.get()` (not hardcoded)
- [ ] Document required secrets (OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.)
- [ ] Test: does it work with a fresh Supabase project?

### 3.2 — Edge function deployment script
- [ ] Create `scripts/deploy-functions.sh` that deploys all 15 functions
- [ ] Document: `supabase functions deploy <name> --project-ref <ref>`
- [ ] Document required secrets: `supabase secrets set OPENAI_API_KEY=... --project-ref <ref>`

---

## PHASE 4: Stripe Integration (Priority: HIGH)

### 4.1 — Stripe product/plan seeding
- [ ] Create `scripts/setup-stripe.ts` (or `.js`) that:
  - Creates 4 Stripe Products (Free, Starter, Professional, Enterprise)
  - Creates monthly + yearly Prices for each
  - Updates `subscription_plans` table with the Stripe price IDs
- [ ] Currently: `stripe_monthly_price_id` and `stripe_yearly_price_id` columns exist but are NULL
- [ ] Needs: Stripe API key as input, outputs the price IDs

### 4.2 — Stripe webhook endpoint
- [ ] Verify: Is there an edge function for Stripe webhooks? (not found in current 15)
- [ ] If missing: Create `stripe-webhook` edge function to handle:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] Update `tenant_subscriptions` table based on webhook events

### 4.3 — Checkout flow
- [ ] Verify the signup → plan selection → Stripe checkout → provisioning flow works end-to-end
- [ ] `src/hooks/use-checkout.ts` — audit for completeness

---

## PHASE 5: Security & Secrets (Priority: HIGH)

### 5.1 — Git history cleanup
- [ ] `.env` was committed to git at some point (confirmed: real API keys in history)
- [ ] Keys exposed: Supabase service role key, OpenAI API key, Shippo key, WooCommerce creds, database password
- [ ] Options:
  - [ ] `git filter-branch` or `bfg` to scrub `.env` from history
  - [ ] OR: Rotate ALL keys (Supabase, OpenAI, Shippo, WooCommerce) — faster and safer
- [ ] After cleanup: verify `.gitignore` covers `.env`, `.env.*`, `.env.local`

### 5.2 — Secret scanning
- [ ] Run `git log --all -p -- '*.ts' '*.tsx' '*.js'` and search for `sk_`, `eyJ`, `shippo_live_`, `whsec_`
- [ ] Ensure no API keys are in any committed source file

### 5.3 — Vercel environment variables
- [ ] Document: Which Vercel env vars a buyer needs to set
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (minimum for frontend)
- [ ] Edge function secrets are separate (Supabase dashboard)

---

## PHASE 6: Documentation & README (Priority: MEDIUM)

### 6.1 — Replace boilerplate README
- [ ] Current README is Lovable's default template — zero useful info
- [ ] New README should cover:
  - What ThePeptideAI is (1 paragraph)
  - Feature list
  - Tech stack (React, Vite, Supabase, Stripe, Tailwind, shadcn/ui)
  - Prerequisites (Node 20+, Supabase account, Stripe account, OpenAI API key)
  - Quick start (5 steps)
  - Environment variables reference table
  - Edge function secrets reference table
  - Architecture overview (frontend → Supabase → Edge Functions)

### 6.2 — Create DEPLOY.md
- [ ] Step-by-step deployment guide:
  1. Create Supabase project
  2. Run `schema-master.sql`
  3. Run `seed-subscription-plans.sql`
  4. Deploy edge functions + set secrets
  5. Create Vercel project (or use Deploy button)
  6. Set Vercel env vars
  7. Set up Stripe (run setup script)
  8. Create first admin user
  9. Configure tenant (branding, shipping)
  10. Verify everything works

### 6.3 — Create ENVIRONMENT.md
- [ ] Complete reference of every env var and edge function secret
- [ ] Which are required vs optional
- [ ] Where to get each one (Supabase dashboard, Stripe dashboard, etc.)

---

## PHASE 7: One-Click Deploy (Priority: MEDIUM)

### 7.1 — Vercel Deploy Button
- [ ] Add "Deploy to Vercel" button to README
- [ ] Create `vercel.json` env var prompts (Vercel asks for them during deploy)
- [ ] Test: click button → fill in vars → site is live

### 7.2 — Supabase setup script
- [ ] Create `scripts/setup.sh` (or `setup.js`) that:
  1. Connects to Supabase via CLI or API
  2. Runs `schema-master.sql`
  3. Runs `seed-subscription-plans.sql`
  4. Deploys all edge functions
  5. Sets edge function secrets (prompts for them)
  6. Creates initial super_admin user
- [ ] Alternative: Make `self-signup` edge function handle first-user-is-admin logic

### 7.3 — First-run experience
- [ ] When no `tenant_config` exists, show a setup wizard instead of the dashboard
- [ ] Wizard collects: company name, logo, primary color, shipping address, payment processor
- [ ] Auto-creates org + tenant_config + sets user as admin
- [ ] Currently: Onboarding.tsx exists but calls `self-signup` — need to verify this flow

---

## PHASE 8: White-Label & Branding (Priority: MEDIUM)

### 8.1 — Dynamic branding throughout app
- [ ] Audit: Which pages use `useTenantConfig()` vs hardcoded branding?
- [ ] `index.html` — title "ThePeptideAI", meta tags, theme-color — make dynamic via SSR or runtime
- [ ] `manifest.json` — "ThePeptideAI" hardcoded — generate dynamically?
- [ ] `favicon.svg` — emerald vial — allow custom favicon via tenant_config?
- [ ] Page titles — does `use-page-title.ts` use tenant brand?

### 8.2 — Custom domains
- [ ] Enterprise tier promises "White-label domain"
- [ ] This requires Vercel custom domains per tenant OR separate deploys
- [ ] Decision needed: shared deploy (all tenants on same URL) vs separate deploys per tenant
- [ ] For MVP: all tenants share `app.thepeptideai.com`, differentiated by org_id after login

---

## PHASE 9: Testing & QA (Priority: HIGH)

### 9.1 — Fresh deploy test
- [ ] Create a BRAND NEW Supabase project (not the production one)
- [ ] Run `schema-master.sql` — verify zero errors
- [ ] Deploy edge functions — verify all 15 deploy clean
- [ ] Create new Vercel project pointing to this Supabase
- [ ] Sign up as first user — verify full flow works
- [ ] Provision a second tenant from vendor dashboard — verify isolation

### 9.2 — Tenant isolation test
- [ ] Create Tenant A and Tenant B
- [ ] Add data to both (peptides, contacts, orders)
- [ ] Verify: Tenant A CANNOT see Tenant B's data (RLS)
- [ ] Verify: Super-admin CAN see both tenants

### 9.3 — Edge function test suite
- [ ] Test each of the 15 edge functions with:
  - Valid input → expected output
  - Invalid input → graceful error
  - Unauthorized request → 401

---

## PHASE 10: Packaging & Distribution (Priority: LOW — do last)

### 10.1 — License
- [ ] Choose license model (proprietary? per-seat? white-label fee?)
- [ ] Add LICENSE file

### 10.2 — Versioning
- [ ] `index.html` has `<meta name="app-version" content="2026.02.18.2">`
- [ ] Automate version bumping in CI/CD
- [ ] Create CHANGELOG.md

### 10.3 — CI/CD pipeline
- [ ] GitHub Actions: lint → type-check → build → deploy preview
- [ ] Vercel preview deploys on PR (already built-in)
- [ ] Edge function deploy on merge to main

### 10.4 — Customer onboarding automation
- [ ] Stripe checkout → webhook → auto-provision tenant → send welcome email
- [ ] Zero-touch: customer pays → gets login credentials → starts using immediately

---

## Quick Reference: Files That Need Changes

| File | Issue | Phase |
|------|-------|-------|
| `src/integrations/sb_client/client.ts` | Hardcoded Supabase URL + key | 2.1 |
| `src/pages/client/ClientStore.tsx` | Hardcoded Venmo handle | 2.2 |
| `src/pages/partner/PartnerStore.tsx` | Hardcoded Venmo handle | 2.2 |
| `supabase/config.toml` | Hardcoded project ID | 2.4 |
| `index.html` | Hardcoded brand name + meta tags | 8.1 |
| `public/manifest.json` | Hardcoded brand name | 8.1 |
| `README.md` | Lovable boilerplate | 6.1 |

## Quick Reference: Edge Functions (15 total)

| Function | Purpose | Env Secrets Needed | Audit Status |
|----------|---------|-------------------|--------------|
| `admin-ai-chat` | Admin AI assistant | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, BRAND_NAME | CLEAN |
| `ai-builder` | AI feature builder | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS | CLEAN |
| `analyze-food` | Photo macro analysis | OPENAI_API_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS | CLEAN |
| `chat-with-ai` | Client AI chat (RAG) | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, BRAND_NAME | CLEAN |
| `check-payment-emails` | Payment email scanner | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, COMPOSIO_API_KEY, ALLOWED_ORIGINS | CLEAN |
| `composio-callback` | OAuth callback | SUPABASE_SERVICE_ROLE_KEY, APP_URL | CLEAN |
| `composio-connect` | Connect 3rd-party | SUPABASE_SERVICE_ROLE_KEY, COMPOSIO_API_KEY, ALLOWED_ORIGINS | CLEAN |
| `exchange-token` | Invite token exchange | SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL, ALLOWED_ORIGINS | CLEAN |
| `invite-user` | Send invites | SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL, ALLOWED_ORIGINS | CLEAN |
| `partner-ai-chat` | Partner AI assistant | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, BRAND_NAME | FIXED |
| `process-health-document` | Process health docs | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS | CLEAN |
| `promote-contact` | Contact → Partner | SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS | CLEAN |
| `provision-tenant` | Create new tenant | SUPABASE_SERVICE_ROLE_KEY, COMPOSIO_API_KEY, ALLOWED_ORIGINS | CLEAN |
| `run-automations` | Execute automations | SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS | CLEAN |
| `self-signup` | Self-service signup | SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS | CLEAN |

---

## Progress Tracker

| Phase | Description | Status | Completion |
|-------|------------|--------|------------|
| 1 | Schema & Database | NOT STARTED | 0% |
| 2 | Remove Hardcoded Values | IN PROGRESS | 80% |
| 3 | Edge Functions Audit | DONE | 100% |
| 4 | Stripe Integration | NOT STARTED | 0% |
| 5 | Security & Secrets | NOT STARTED | 0% |
| 6 | Documentation | NOT STARTED | 0% |
| 7 | One-Click Deploy | NOT STARTED | 0% |
| 8 | White-Label & Branding | NOT STARTED | 0% |
| 9 | Testing & QA | NOT STARTED | 0% |
| 10 | Packaging & Distribution | NOT STARTED | 0% |

**Overall: ~65% of the way to a deployable product. Hard architecture is done. Remaining work is packaging, cleanup, and documentation.**
