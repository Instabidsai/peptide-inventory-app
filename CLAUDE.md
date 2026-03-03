# ThePeptideAI — Claude Code Project Context

## LIVING DOCUMENT INSTRUCTION
**Agents: update this file as you work.** When you discover something that would have saved you time — a gotcha, a dependency, a fragile area, a pattern that works — add it. Keep entries concise. Future agents (and future you) will thank you.
- Add discoveries to the relevant section below
- If a "Current Status" item changes, update the checkbox
- If you find a new dependency between subsystems, add it to the Dependency Map
- Date your additions: `<!-- added 2026-XX-XX -->`

---

## What This Is
Multi-tenant B2B/B2C SaaS platform for peptide businesses. Each merchant gets their own org (multi-tenancy via `org_id`). We use it internally for PureUSPeptide AND license/sell it to other peptide companies.

**Live app**: https://app.thepeptideai.com
**GitHub**: `Instabidsai/peptide-inventory-app`
**Vercel project**: production branch = `main`
**Push command**: `git push origin main:master && git push origin main:main`

---

## Stack
- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + TanStack Query
- **Database**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Hosting**: Vercel (frontend) + Supabase Edge Functions
- **Payments**: Stripe + PsiFi + Zelle/Venmo/CashApp (manual)
- **Shipping**: Shippo (USPS/FedEx/UPS label generation)
- **AI**: Supabase Edge Functions calling Anthropic/OpenAI
- **Agent API**: Python FastAPI in `/agent-api/` (Docker, handles AI chat)

---

## Project Structure
```
src/
  pages/
    admin/        # Admin portal (inventory, orders, finance, partners)
    client/       # Client portal (protocols, store, health tracking)
    vendor/       # Super-admin (manage all tenants/orgs)
    sales/        # Order management
  components/
    ai/           # AI chat interfaces
    contacts/     # CRM components
    fulfillment/  # Pick/pack/ship workflow
    gamified/     # Client compliance tracking
    landing/      # Marketing pages
  integrations/
    sb_client/    # Supabase client ← ALWAYS import from here

supabase/
  functions/      # 35+ edge functions (all deployed)
    _shared/      # auth.ts, cors.ts — shared utilities
  migrations/     # 54 migration files

api/              # Vercel serverless functions
  billing/        # Stripe subscription management
  checkout/       # Payment session creation
  shipping/       # Shippo label API
  webhooks/       # Stripe, WooCommerce, PsiFi, Textbelt

agent-api/        # Python FastAPI for AI merchant onboarding
  CLAUDE.md       # ⚠️ DO NOT MODIFY — this is the AI agent system prompt
  api/main.py     # Agent dispatch and auth
```

---

## User Roles
| Role | Access |
|------|--------|
| `admin` | Full org access — inventory, orders, finance, all clients |
| `staff` | Operational — inventory movements, orders, contacts |
| `sales_rep` | Partner portal — own orders, clients, commissions, downline |
| `customer` | Client portal — protocols, store, health tracking |
| `vendor` | Super-admin — manages all tenant orgs (PureUSPeptide team only) |

---

## CRITICAL DATABASE RULES — Read Before Any DB Work

### 1. Supabase Import Path
```typescript
// ✅ ALWAYS use this
import { supabase } from '@/integrations/sb_client/client'

// ❌ NEVER use this
import { supabase } from '@/lib/supabase'
import { supabase } from 'supabase/client'
```

### 2. Every Query Must Be Org-Scoped
```typescript
// ✅ Always filter by org_id
const { data } = await supabase
  .from('peptides')
  .select('*')
  .eq('org_id', orgId)

// ❌ Never query without org scope
const { data } = await supabase.from('peptides').select('*')
```

### 3. Edge Function Writes Must Prepend set_config
Each `execute_sql` call is a separate DB session. Prepend `set_config` to EVERY write in the same call:
```sql
-- ✅ Correct: combined in ONE call
SELECT set_config('app.agent_org_id', '<ORG_ID>', true);
INSERT INTO peptides (org_id, name, retail_price, active)
VALUES ('<ORG_ID>', 'BPC-157', 49.99, true);

-- ❌ Wrong: separate calls (config is lost)
SELECT set_config('app.agent_org_id', '<ORG_ID>', false);
-- next call: NEW session, trigger blocks it
INSERT INTO peptides ...
```

### 4. tenant_config — Always UPDATE, Never INSERT
Every org has exactly one `tenant_config` row created at signup:
```sql
-- ✅ Always UPDATE
UPDATE tenant_config SET brand_name = 'X' WHERE org_id = '<ORG_ID>';

-- ❌ Never INSERT
INSERT INTO tenant_config ...
```

### 5. Never Use verify_jwt = true in Edge Functions
Every edge function must have `supabase/functions/<name>/config.toml` with:
```toml
verify_jwt = false
```
Auth is handled in code via `supabase/functions/_shared/auth.ts`. Gateway JWT causes race conditions on token refresh.

---

## Key Database Tables
```
organizations       — Tenant orgs (one per merchant)
profiles            — Users linked to orgs (role, commission_rate, partner_tier)
tenant_config       — Branding, payments, shipping per org (ONE ROW PER ORG)
peptides            — Product catalog per org
lots                — Inventory batches with cost tracking
bottles             — Individual bottle UIDs with status tracking
orders              — Sales orders
contacts            — CRM contacts (clients, partners, leads)
commissions         — Partner commission records
pricing_tiers       — Retail/partner/VIP discount levels per org
org_features        — Feature flags per org (19 features)
subscription_plans  — SaaS billing tiers (Free/Starter/Professional/Enterprise)
partner_discount_codes — Partner coupon codes synced to WooCommerce/Shopify
tenant_connections  — Platform OAuth connections (Shopify via Composio)
```

---

## Edge Functions (supabase/functions/)
All 35+ are deployed. Key ones:
| Function | Purpose |
|----------|---------|
| `admin-ai-chat` | Admin AI assistant |
| `chat-with-ai` | Client-facing AI (RAG over peptide knowledge) |
| `partner-ai-chat` | Partner portal AI |
| `ai-builder` | AI feature builder (English → code) |
| `provision-tenant` | Create new merchant org |
| `scrape-brand` | Scrape merchant website for branding/products |
| `self-signup` | Merchant self-serve signup |
| `send-email` | Email notifications |
| `invite-user` | Invite users to org |
| `check-payment-emails` | Auto-match Zelle/Venmo payments |

---

## Running the App
```bash
# Frontend dev server
bun run dev          # http://localhost:5173

# Tests
bun run test
bun run test:coverage

# Build
bun run build

# Supabase functions (deploy single)
supabase functions deploy <function-name>

# Push to production
git push origin main:master && git push origin main:main
```

---

## Current Status (as of 2026-02-22)
**What's complete:**
- Multi-tenancy (org_id on all 57 tables)
- All 35+ edge functions deployed
- Subscription/billing system (4 tiers)
- Vendor dashboard (manage all tenants)
- Schema: `scripts/schema-master.sql` (2,214 lines, 57 tables)
- Security headers, RLS policies, auth flow
- AI chat (client + admin + partner)
- Shippo shipping integration
- WooCommerce sync

**Still needs work:**
- Remove hardcoded Supabase keys from `src/integrations/sb_client/client.ts`
- Git history secret scrub (secrets were committed — needs BFG or filter-branch)
- Stripe plan seeding with real price IDs
- Tenant Venmo handle → should come from `tenant_config`, not hardcoded
- Full end-to-end test of merchant signup → onboarding → first order

---

## Agent API (`/agent-api/`)
Separate Python FastAPI service handling AI merchant onboarding chat.
- `agent-api/CLAUDE.md` — system prompt for the AI agent. **Do not modify this file** for coding tasks — it's an AI instruction document, not a developer doc.
- `agent-api/api/main.py` — FastAPI app with `/chat` and `/health` endpoints
- Deployed via Docker on a droplet (separate from Vercel)

---

## Feature Map — Where Everything Lives

### Inventory
| Feature | Pages | Components | Tables |
|---------|-------|------------|--------|
| Peptide catalog | `src/pages/Peptides.tsx` | `components/peptides/` | `peptides` |
| Lot tracking | `src/pages/Lots.tsx` | — | `lots` |
| Bottle-level UIDs | `src/pages/Bottles.tsx` | — | `bottles` |
| Stock movements | `src/pages/Movements.tsx`, `MovementWizard.tsx` | — | `inventory_movements` |

### Orders & Fulfillment
| Feature | Pages | Tables | Edge/API |
|---------|-------|--------|----------|
| Order list | `src/pages/Orders.tsx`, `sales/OrderList.tsx` | `orders`, `order_items` | — |
| New order | `src/pages/sales/NewOrder.tsx` | `orders`, `order_items`, `bottles` | — |
| Order detail | `src/pages/sales/OrderDetails.tsx` | `orders` | — |
| Fulfillment center | `src/pages/FulfillmentCenter.tsx` | `orders`, `bottles`, `lots` | `check-low-supply` |
| Shipping labels | — | `orders` | `api/shipping/` (Shippo) |
| Payment tracking | `src/pages/pay/PayOrder.tsx` | `orders` | `check-payment-emails`, `api/webhooks/` |

### Contacts / CRM
| Feature | Pages | Tables |
|---------|-------|--------|
| Contact list | `src/pages/Contacts.tsx` | `contacts` |
| Contact detail | `src/pages/ContactDetails.tsx` | `contacts`, `profiles`, `orders`, `commissions` |

### Protocols & Health
| Feature | Pages | Components | Tables |
|---------|-------|------------|--------|
| Protocol builder | `src/pages/ProtocolBuilder.tsx` | `components/protocol-builder/` | `protocols`, `regimen_items` |
| Protocol list | `src/pages/Protocols.tsx` | — | `protocols` |
| Client regimen | `src/pages/client/ClientRegimen.tsx` | `components/regimen/` | `regimens` |
| Health tracking | `src/pages/client/HealthTracking.tsx` | — | `health_logs` |
| Body composition | `src/pages/client/BodyComposition.tsx` | — | `body_composition` |
| Macro tracker | `src/pages/client/MacroTracker.tsx` | — | `nutrition_logs` |
| Food analysis | — | — | Edge: `analyze-food`, `process-health-document` |

### Partners / Commissions
| Feature | Pages | Tables |
|---------|-------|--------|
| Rep list | `src/pages/admin/Reps.tsx` | `profiles` (role=sales_rep) |
| Partner detail | `src/pages/admin/PartnerDetail.tsx` | `profiles`, `commissions`, `contacts` |
| Commission records | `src/pages/admin/Commissions.tsx` | `commissions`, `pricing_tiers` |
| Tier config | `src/pages/admin/components/TierConfigTab.tsx` | `wholesale_pricing_tiers` |
| Partner dashboard | `src/pages/partner/PartnerDashboard.tsx` | `commissions`, `profiles` |
| Partner store | `src/pages/partner/PartnerStore.tsx` | `peptides`, `pricing_tiers` |
| Downline viz | `src/pages/admin/components/DownlineVisualizer.tsx` | `profiles` (upline_id chain) |

### Client Portal
All under `src/pages/client/`. Tables: `orders`, `protocols`, `health_logs`, `contacts`, `notifications`.
- `ClientDashboard.tsx` — overview
- `ClientStore.tsx` — buy peptides
- `ClientOrders.tsx` — order history
- `ClientRegimen.tsx` — active protocols
- `ClientMessages.tsx` — messaging with admin
- `ClientResources.tsx` — educational content
- `ClientSettings.tsx` — profile settings
- `CommunityForum.tsx` — community

### AI Systems
| Feature | Pages/Components | Edge Functions |
|---------|-----------------|----------------|
| Client AI chat | `src/pages/AIAssistant.tsx`, `components/ai/AIChatInterface.tsx` | `chat-with-ai` (RAG) |
| Admin AI chat | `components/ai/AdminAIChat.tsx` | `admin-ai-chat` |
| Partner AI chat | `components/ai/PartnerAIChat.tsx` | `partner-ai-chat` |
| AI builder | `components/custom/AiBuilderChat.tsx` | `ai-builder`, `code-patcher` |
| Merchant onboarding AI | `pages/merchant/MerchantOnboarding.tsx`, `pages/SetupAssistant.tsx` | `agent-api/` (Python FastAPI) |

### Multi-Tenant / Vendor
See `src/pages/vendor/CLAUDE.md` for full detail.
- Vendor portal manages ALL tenant orgs
- Key edge functions: `provision-tenant`, `scrape-brand`, `self-signup`, `invite-user`
- Dangerous area — changes here affect all tenants

### Integrations
| Integration | Files | Edge Functions |
|------------|-------|----------------|
| WooCommerce | `src/pages/Integrations.tsx` | `woo-connect`, `woo-webhook`, `woo-sync-products`, `woo-sync-customers`, `woo-callback`, `woo-manual-connect` |
| Shopify | `src/pages/Integrations.tsx` | `shopify-webhook`, `shopify-sync-products`, `shopify-sync-customers` |
| Composio | — | `composio-connect`, `composio-callback` (auto-registers Shopify webhooks) |
| Discount Codes | `src/pages/admin/PartnerDetail.tsx` | `sync-discount-codes` |
| SMS/Telegram | — | `sms-webhook`, `telegram-webhook`, `textbelt-webhook` |
| Stripe | `api/billing/`, `api/checkout/`, `api/webhooks/stripe.ts` | — |
| PsiFi payments | `api/webhooks/psifi.ts` | — |

### Admin
See `src/pages/admin/CLAUDE.md` for full detail.
- `AdminDashboard.tsx` — main admin view
- `Finance.tsx` — P&L, per-order profitability
- `Automations.tsx` — rule-based automation engine → edge: `run-automations`
- `FeatureManagement.tsx` — toggle `org_features` per tenant
- `SystemHealth.tsx` — service health monitoring
- `AdminResources.tsx` — content management
- `FeedbackHub.tsx` — client requests + partner suggestions + auto-heal integration

### Self-Healing System (Fully Autonomous — Zero Human-in-the-Loop)
**FULL REFERENCE**: `supabase/functions/sentinel-worker/CLAUDE.md` (319 lines) — READ THAT FILE before touching ANY self-healing code.

This is a complete autonomous error detection → diagnosis → repair → verification system. **Everything below is BUILT and DEPLOYED.**

| Component | File | Lines | Cron | Status |
|-----------|------|-------|------|--------|
| **sentinel-worker** | `supabase/functions/sentinel-worker/index.ts` | 2,440 | `*/2 * * * *` | 17-phase self-healing engine |
| **meta-sentinel** | `supabase/functions/meta-sentinel/index.ts` | 232 | `*/30 * * * *` | Self-monitoring + adaptive thresholds |
| **code-patcher** | `supabase/functions/code-patcher/index.ts` | 392 | On-demand | GitHub API code repair (branch → PR → auto-merge) |
| **health-probe** | `supabase/functions/health-probe/index.ts` | 1,099 | `*/5 * * * *` | 12 categories, ~40+ health checks |
| **health-digest** | `supabase/functions/health-digest/index.ts` | 594 | `0 7 * * *` | Daily HTML health summary email |
| **boot-failure** | `supabase/functions/boot-failure/index.ts` | 210 | On-demand | Boot crash → auto-rollback (3+ IPs in 10min) |
| **synthetic-monitor** | `supabase/functions/synthetic-monitor/index.ts` | 238 | `*/5 * * * *` | External content check + auto-rollback |
| **auto-error-reporter** | `src/lib/auto-error-reporter.ts` | 574 | Client-side | Error capture + self-healing via Realtime |

**17 database tables**: bug_reports, error_patterns, health_checks, incidents, heal_log, sentinel_runs, fix_plans, client_heal_instructions, code_patches, schema_heal_log, circuit_breaker_events, escalation_log, rollback_events, deploy_events, performance_baselines, sentinel_meta, synthetic_checks

**Auto-heal button flow** (FeedbackHub → sentinel):
1. `SendToAutoHealButton` inserts into `bug_reports` with `error_fingerprint` dedup
2. sentinel-worker picks it up within 2 min (Phase 1)
3. Pattern match (Phase 3) → AI diagnosis + structured fix plan (Phase 4) → execute action (Phase 5+)
4. Fix types: suppress, client_instruction, config_change, rpc_call, schema_ddl, code_patch, rollback

<!-- added 2026-03-03 -->

---

## Dependency Map — What Breaks What
**Read this before modifying any core table or flow.**

```
organizations
  └── profiles (org_id FK) — DON'T delete org without cascading
  └── tenant_config (org_id PK) — one row per org, always UPDATE not INSERT
  └── org_features (org_id FK) — 19 feature flags seeded at signup

peptides
  └── lots (peptide_id FK) — can't delete peptide with lots
  └── scraped_peptides (imported_peptide_id FK)
  └── pricing_tiers — pricing calculated from tiers, not stored on peptide

lots
  └── bottles (lot_id FK) — inventory counts come from bottles, not lots

contacts
  └── orders (contact_id FK) — can't create order without contact
  └── commissions (partner_id FK — via profiles)
  └── households (household_id FK)

orders
  └── commissions (TRIGGER on order insert/update) — changing order status fires commission trigger
  └── bottles (status updated on fulfillment)
  └── order_items (cascade delete safe)

profiles
  └── commissions (partner_id FK) — sales_rep role only
  └── upline_id self-reference — multi-level commission tree
```

**High-risk operations:**
- Changing `orders.status` → triggers commission calculation
- Modifying RLS policies → can expose cross-org data
- Deleting from `tenant_config` → breaks entire tenant
- Editing `_shared/auth.ts` → affects all 35+ edge functions
- Changing `org_features` seeding in `provision-tenant` → affects all new signups

---

## Common Patterns

### Adding a New Feature
1. Check if the feature needs a new DB table → add migration in `supabase/migrations/`
2. If it needs server logic → add edge function in `supabase/functions/`
3. Frontend component → `src/components/` or `src/pages/`
4. Always scope DB queries by `org_id`
5. Feature-flag it via `org_features` if it should be toggleable per tenant

### Adding a New Edge Function
```bash
supabase functions new <function-name>
# Add config.toml with verify_jwt = false
# Import auth from _shared/auth.ts
# Deploy: supabase functions deploy <function-name>
```

### Testing Auth Flow
Test user: `ai_tester@instabids.ai` / `TestAI2026!` (email confirmed, has admin role)
