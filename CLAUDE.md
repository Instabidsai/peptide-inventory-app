# ThePeptideAI — Multi-Tenant Peptide Business Platform

Multi-tenant B2B/B2C SaaS for peptide businesses. Each merchant gets their own org. We use it for PureUSPeptide AND license to other companies.

**Live**: https://app.thepeptideai.com | **GitHub**: `Instabidsai/peptide-inventory-app` | **Vercel branch**: `main`

## Stack
React 18 + TypeScript + Vite + shadcn/ui + TanStack Query · Supabase (Postgres + RLS + 44 Edge Functions) · Stripe + PsiFi · Shippo · OpenAI/Anthropic AI · Python FastAPI agent-api (Docker)

## Commands
```bash
bun run dev                    # Dev server (port 5173)
bun run build                  # Production build
bun run test                   # Vitest
supabase functions deploy X    # Deploy single edge function
git push origin main:master && git push origin main:main  # Deploy to Vercel
```

## User Roles
| Role | Access |
|------|--------|
| `admin` | Full org access — inventory, orders, finance, partners |
| `staff` | Operational — inventory, orders, contacts |
| `sales_rep` | Partner portal — own orders, clients, commissions, downline |
| `customer` | Client portal — protocols, store, health tracking |
| `vendor` | Super-admin — manages ALL tenant orgs (PureUSPeptide only) |

## 5 Critical Rules
1. **Import**: Always `import { supabase } from '@/integrations/sb_client/client'`
2. **Org scope**: Every query MUST include `.eq('org_id', orgId)`
3. **set_config**: Edge function writes must prepend `SELECT set_config(...)` in SAME SQL call
4. **tenant_config**: Always UPDATE, never INSERT (one row per org)
5. **verify_jwt**: Always `false` in config.toml — auth via `_shared/auth.ts`

## Key Systems (detail in specs/)

| System | Reference | What to know |
|--------|-----------|-------------|
| Admin portal | `specs/admin-portal.md` | Commission system (DB trigger), finance, automations, feature flags |
| Vendor portal | `specs/vendor-portal.md` | Super-admin tenant management, provisioning flow, NEVER use currentUser.orgId |
| Client portal | `specs/client-portal.md` | Health tracking, protocols, store, AI chat |
| Partner/Commissions | `specs/partner-commissions.md` | Most fragile subsystem — trigger-based, multi-level upline chain |
| Edge functions | `specs/edge-functions.md` | All 44 functions organized by category |
| Self-healing | `specs/self-healing.md` | 16-phase sentinel-worker, zero-human-in-the-loop, 17 DB tables |
| Integrations | `specs/integrations.md` | WooCommerce (6 fn), Shopify (3 fn + Composio), Stripe, Shippo |
| **Payment Pool** | `specs/payment-pool.md` | **USDC pool for card processing. Smart contract + 4 edge functions + WooCommerce plugin + dashboard. Code complete, needs NMI sandbox E2E test.** |
| **SaaS Mode** | See below | Feature flag system to strip medical features for B2B SaaS tenants. One master switch (`saas_mode`) controls 5 child flags. |

## Schema & Debugging
- `.agent/schema.sql` — 57 tables condensed reference (full DDL: `scripts/schema-master.sql`)
- `.agent/runbook.md` — dependency map, high-risk operations, symptom → cause → fix
- `.agent/conventions.md` — import paths, org scoping, edge function patterns
- `.agent/decisions-log.jsonl` — architectural WHY decisions
- `.agent/scope.md` — what this project does NOT do

## SaaS-Safe Mode (Feature Flag System)
Master switch `saas_mode` in `org_features` controls B2B tenant safety. When ON:
- `health_tracking` → OFF (body comp, macros, water, compliance)
- `dose_tracking` → OFF (dose scheduling, vials, compliance heatmap)
- `client_health_ai` → OFF (AI health tools: log_dose, log_body_comp, log_meal, view_protocols)
- `protocols` → OFF (protocol builder, client regimen)
- `ruo_disclaimer` → ON ("For research use only" on all products + checkout)

**Files**: `src/lib/feature-registry.ts` (SAAS_MODE_OVERRIDES), `src/hooks/use-org-features.ts` (cascade logic), `src/components/FeatureGate.tsx` (route guard), `supabase/functions/chat-with-ai/index.ts` (AI tool filtering), `supabase/functions/provision-tenant/index.ts` (preset system)

**Safety**: Toggling `saas_mode` writes all 6 flags to DB in one upsert. Edge functions query flags directly. PureUS has `saas_mode=false` — all features ON, no RUO disclaimer.

## Current Status (2026-03-11)
**Complete**: Multi-tenancy (57 tables), 48 edge functions, subscription billing (4 tiers), vendor dashboard, self-healing system (17-phase), AI chat (3 variants), Shippo shipping, WooCommerce + Shopify sync, partner commissions, **USDC Payment Pool** (code complete, needs E2E testing), **SaaS-Safe Mode** (feature flag system for B2B tenants)

**Needs work**: Hardcoded Supabase keys in client.ts, git history secret scrub, Stripe plan seeding with real price IDs, tenant Venmo handle from tenant_config, full e2e merchant signup test, **Payment Pool WooCommerce + NMI sandbox integration test**

## Agent API (`/agent-api/`)
Python FastAPI for AI merchant onboarding chat. `agent-api/CLAUDE.md` is the AI system prompt — don't modify for coding tasks. Docker deployed separately.

## Test User
`ai_tester@instabids.ai` / `TestAI2026!` (admin role, email confirmed)
