# Edge Functions — ThePeptideAI
_Agents: update this file when you add, modify, or deprecate a function._

## CRITICAL RULE — Every Function
Every edge function MUST have a `config.toml` in its directory:
```toml
[functions.<function-name>]
verify_jwt = false
```
Auth is handled in code via `_shared/auth.ts`. Never use `verify_jwt = true` — causes race conditions on token refresh.

---

## Shared Utilities (`_shared/`)
Always use these — don't reimplement in individual functions.

| File | What it does |
|------|-------------|
| `_shared/auth.ts` | Validates bearer token, extracts user + org_id. Use at top of every function that needs auth. |
| `_shared/cors.ts` | CORS headers. Always include in responses. |
| `_shared/error-reporter.ts` | Structured error logging. Use instead of console.error. |
| `_shared/schema-healer.ts` | Self-healing schema utilities — used by sentinel system. |

### Standard Function Template
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user, orgId } = await authenticate(req)
    // ... your logic, always scope to orgId
    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

---

## All Functions — Reference

### AI / Chat
| Function | Purpose | Auth Required | Notes |
|----------|---------|---------------|-------|
| `chat-with-ai` | Client-facing peptide AI (RAG) | Yes | Main AI chat, queries knowledge base. **SaaS Mode**: queries `org_features` for `saas_mode` + `client_health_ai` flags. When health AI is OFF, swaps system prompt to product-inquiry-only and removes health tools (`log_dose`, `log_body_composition`, `view_my_protocols`, `log_meal`). |
| `admin-ai-chat` | Admin AI assistant | Yes (admin role) | Full DB access for admin queries |
| `partner-ai-chat` | Partner portal AI | Yes (sales_rep role) | Scoped to partner's org/downline |
| `ai-builder` | English → feature code generation | Yes (admin role) | Writes code, calls code-patcher |
| `code-patcher` | Applies AI-generated code changes | Yes (admin role) | Called by ai-builder, not directly |
| `analyze-food` | Food image → nutrition data | Yes | Client health tracking |
| `process-health-document` | PDF/doc → health data extraction | Yes | Client health tracking |

### Admin / Impersonation
| Function | Purpose | Auth Required | Notes |
|----------|---------|---------------|-------|
| `admin-impersonate` | Mints a real JWT for a target user so admin can fully impersonate them | Yes (admin/super_admin role) | Uses service role to call `auth.admin.generateLink`. Returns `access_token` + `refresh_token`. Called by `ImpersonationContext.tsx` — do NOT call directly from other code. Admin session backup/restore handled client-side in localStorage. |

### Tenant / Merchant
| Function | Purpose | Notes |
|----------|---------|-------|
| `provision-tenant` | Creates new merchant org | Seeds: org, tenant_config, org_features (27+), pricing_tiers, subscription link. **Presets**: accepts `preset: 'saas_clean' | 'full'` in body. `saas_clean` (default): `saas_mode=true`, health/dose/protocols OFF, `ruo_disclaimer` ON. `full`: everything ON. |
| `self-signup` | Merchant self-serve signup flow | Public endpoint — no auth |
| `scrape-brand` | Scrapes merchant website → branding + peptide catalog | Async, long-running |
| `scrape-brand-status` | Polls scrape-brand job status | Returns progress + results |
| `invite-user` | Invites user to an org with role | Sends Supabase auth invite email |
| `promote-contact` | Upgrades contact → full user account | Creates auth user, links profile |
| `exchange-token` | OAuth token exchange (WooCommerce etc.) | — |

### Notifications / Comms
| Function | Purpose |
|----------|---------|
| `send-email` | Transactional email via Resend |
| `notify-commission` | Fires when commission is created/updated |
| `sms-webhook` | Inbound SMS handler |
| `textbelt-webhook` | Textbelt SMS callback |
| `telegram-webhook` | Telegram bot messages |

### Integrations
| Function | Purpose |
|----------|---------|
| `woo-connect` | OAuth flow to connect WooCommerce store |
| `woo-webhook` | Receives WooCommerce order/product events. **v22 deployed** via zero-import pattern (pure fetch, no esm.sh). 3-layer attribution: coupon → email → cookie. Resolves `partner_id` (user_id) → `profiles.id` before setting `rep_id`. Auto-triggers `process_sale_commission(p_sale_id)` RPC. |
| `woo-sync-products` | Manual sync of WooCommerce product catalog |
| `woo-callback` | WooCommerce OAuth callback |
| `woo-manual-connect` | Manual WooCommerce connection (API key auth) |
| `shopify-webhook` | Receives Shopify events |
| `shopify-sync-products` | Sync Shopify product catalog → peptides table |
| `shopify-sync-customers` | Import Shopify customers → contacts table |
| `woo-sync-customers` | Import WooCommerce customers → contacts table |
| `sync-discount-codes` | Create/update/delete partner discount codes on platforms |
| `composio-connect` | Initiates Composio OAuth for integrations |
| `composio-callback` | Composio OAuth callback (+ auto webhook registration for Shopify) |
| `create-supplier-order` | Places order with peptide supplier |
| `fulfill-order` | Fulfills a sales order: movement + FIFO bottles + client_inventory + commissions + COGS. Uses service role to bypass RLS |

### Automation / Health
| Function | Purpose | Trigger |
|----------|---------|---------|
| `run-automations` | Executes automation rules engine | Manual or scheduled |
| `check-low-supply` | Alerts when lot quantities fall below threshold | Scheduled (cron) |
| `check-payment-emails` | Scans email inbox for Zelle/Venmo payment confirmations | Scheduled |
| `health-probe` | 12-category infrastructure health (1,099 lines, ~40+ checks) | `*/5 * * * *` |
| `health-digest` | Daily HTML health summary email via Resend (594 lines) | `0 7 * * *` |
| `meta-sentinel` | Self-monitoring + adaptive thresholds (232 lines) | `*/30 * * * *` |
| `sentinel-worker` | **17-phase autonomous self-healing engine (2,440 lines)** — see `sentinel-worker/CLAUDE.md` | `*/2 * * * *` |
| `code-patcher` | GitHub API code repair: branch → commit → PR → Vercel preview → auto-merge (392 lines) | On-demand |
| `boot-failure` | Boot crash receiver → auto-rollback after 3+ unique IPs in 10min (210 lines) | On-demand |
| `synthetic-monitor` | External content verification + auto-rollback (238 lines) | `*/5 * * * *` |
| `deploy-webhook` | Triggers Vercel redeploy | CI/CD |

> **Self-Healing System**: Full architecture docs at `sentinel-worker/CLAUDE.md` (319 lines). Read that BEFORE touching any self-healing code.

---

## Deploying Functions

```bash
# Deploy single function
supabase functions deploy <function-name>

# Deploy all functions
supabase functions deploy

# View logs
supabase functions logs <function-name> --tail
```

## Adding a New Function
1. `supabase functions new <function-name>`
2. Create `supabase/functions/<function-name>/config.toml` with `verify_jwt = false`
3. Import from `_shared/` — don't rewrite auth/cors
4. Always scope DB operations to `orgId` from `authenticate(req)`
5. Add to this reference table above
6. Deploy: `supabase functions deploy <function-name>`

---

## Agent Notes
_Add discoveries here as you work on edge functions._
<!-- agents: append findings below with date -->
<!-- added 2026-03-02 -->
- **Shopify end-to-end**: composio-callback now auto-registers `orders/create` and `orders/updated` webhooks after Shopify OAuth completes. Uses `SHOPIFY_CREATE_WEBHOOK` via Composio API.
- **platform-order-sync.ts**: Now supports `shopify_order_id` for dedup + `discount_codes` field for coupon→partner attribution via `partner_discount_codes` table.
- **Customer sync pattern**: Both `woo-sync-customers` and `shopify-sync-customers` match by email (case-insensitive), only update existing contacts if new data is richer (has phone/address/name when existing doesn't).
- **Composio response shapes**: `extractCustomers()` and `extractProducts()` helpers handle multiple possible response formats from Composio API (data.customers, response_data.customers, etc).
- **Discount code platform sync**: Two-step process for Shopify — create priceRule first, then create discount code under it. Composite `platform_coupon_id` format: `woo:123,shopify:456`.
- **New migration**: `partner_discount_codes` table with RLS. Unique constraint on `(org_id, code)`. Soft-delete via `active` boolean.
<!-- added 2026-03-17 -->
- **woo-webhook v22 (zero-import)**: Deployed via Composio using pure fetch() against REST API. No imports — bypasses ESZIP `--no-remote` restriction. Original `index.ts` kept as source of truth. v22 source: `index.v22-zero-import.ts`.
- **rep_id FK fix**: `partner_discount_codes.partner_id` stores `profiles.user_id`, but `sales_orders.rep_id` FK references `profiles.id`. Must resolve via profiles table. Fixed in both `platform-order-sync.ts` and `woo-webhook/index.v22-zero-import.ts`.
- **process_sale_commission RPC**: Parameter is `p_sale_id` (NOT `p_order_id`). Commissions table uses `sale_id` column (NOT `sales_order_id`).
