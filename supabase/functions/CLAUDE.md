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
| `chat-with-ai` | Client-facing peptide AI (RAG) | Yes | Main AI chat, queries knowledge base |
| `admin-ai-chat` | Admin AI assistant | Yes (admin role) | Full DB access for admin queries |
| `partner-ai-chat` | Partner portal AI | Yes (sales_rep role) | Scoped to partner's org/downline |
| `ai-builder` | English → feature code generation | Yes (admin role) | Writes code, calls code-patcher |
| `code-patcher` | Applies AI-generated code changes | Yes (admin role) | Called by ai-builder, not directly |
| `analyze-food` | Food image → nutrition data | Yes | Client health tracking |
| `process-health-document` | PDF/doc → health data extraction | Yes | Client health tracking |

### Tenant / Merchant
| Function | Purpose | Notes |
|----------|---------|-------|
| `provision-tenant` | Creates new merchant org | Seeds: org, tenant_config, org_features (19), pricing_tiers, subscription link |
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
| `woo-webhook` | Receives WooCommerce order/product events |
| `woo-sync-products` | Manual sync of WooCommerce product catalog |
| `woo-callback` | WooCommerce OAuth callback |
| `woo-manual-connect` | Manual WooCommerce connection (API key auth) |
| `shopify-webhook` | Receives Shopify events |
| `composio-connect` | Initiates Composio OAuth for integrations |
| `composio-callback` | Composio OAuth callback |
| `create-supplier-order` | Places order with peptide supplier |

### Automation / Health
| Function | Purpose | Trigger |
|----------|---------|---------|
| `run-automations` | Executes automation rules engine | Manual or scheduled |
| `check-low-supply` | Alerts when lot quantities fall below threshold | Scheduled (cron) |
| `check-payment-emails` | Scans email inbox for Zelle/Venmo payment confirmations | Scheduled |
| `health-probe` | Lightweight health check endpoint | Monitoring |
| `health-digest` | Aggregates system health metrics | Scheduled |
| `meta-sentinel` | Self-healing schema monitor | Scheduled |
| `sentinel-worker` | Executes sentinel healing tasks | Called by meta-sentinel |
| `deploy-webhook` | Triggers Vercel redeploy | CI/CD |

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
