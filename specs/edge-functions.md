# Edge Functions — ThePeptideAI

44 edge functions in `supabase/functions/`. All deployed. Every function MUST have `config.toml` with `verify_jwt = false`.

## Shared Utilities (`_shared/`)

| File | Purpose |
|------|---------|
| `auth.ts` | Validates bearer token, extracts user + org_id |
| `cors.ts` | CORS headers — include in every response |
| `error-reporter.ts` | Structured error logging → bug_reports |
| `schema-healer.ts` | SQL safety validation + Management API DDL |

## AI / Chat (7)

| Function | Purpose | Auth | Notes |
|----------|---------|------|-------|
| `chat-with-ai` | Client AI (RAG over knowledge base) | Yes | Main AI chat |
| `admin-ai-chat` | Admin AI assistant | Yes (admin) | Full DB access |
| `partner-ai-chat` | Partner portal AI | Yes (sales_rep) | Scoped to partner's data |
| `ai-builder` | English → feature code generation | Yes (admin) | Calls code-patcher |
| `code-patcher` | Applies AI-generated code changes | Yes (admin) | Called by ai-builder |
| `analyze-food` | Food image → nutrition data | Yes | Client health tracking |
| `process-health-document` | PDF/doc → health extraction | Yes | Client health tracking |

## Tenant / Merchant (7)

| Function | Purpose | Notes |
|----------|---------|-------|
| `provision-tenant` | Creates new merchant org | Seeds: org, tenant_config, org_features (19), pricing_tiers, subscription |
| `self-signup` | Merchant self-serve signup | Public — no auth |
| `scrape-brand` | Scrapes merchant website → branding + catalog | Async, long-running |
| `scrape-brand-status` | Polls scrape-brand job status | Returns progress |
| `invite-user` | Invites user to org with role | Sends Supabase auth email |
| `promote-contact` | Upgrades contact → full user | Creates auth user + profile |
| `exchange-token` | OAuth token exchange | WooCommerce etc. |

## Notifications / Comms (5)

| Function | Purpose |
|----------|---------|
| `send-email` | Transactional email via Resend |
| `notify-commission` | Fires on commission create/update |
| `sms-webhook` | Inbound SMS handler |
| `textbelt-webhook` | Textbelt SMS callback |
| `telegram-webhook` | Telegram bot messages |

## Integrations (12)

| Function | Purpose |
|----------|---------|
| `woo-connect` | OAuth to connect WooCommerce |
| `woo-webhook` | Receives WooCommerce events |
| `woo-sync-products` | Sync WooCommerce products → peptides |
| `woo-sync-customers` | Import WooCommerce customers → contacts |
| `woo-callback` | WooCommerce OAuth callback |
| `woo-manual-connect` | Manual WooCommerce (API key auth) |
| `shopify-webhook` | Receives Shopify events |
| `shopify-sync-products` | Sync Shopify catalog → peptides |
| `shopify-sync-customers` | Import Shopify customers → contacts |
| `sync-discount-codes` | Sync partner discount codes to platforms |
| `composio-connect` | Initiates Composio OAuth |
| `composio-callback` | Composio callback (+ auto Shopify webhook registration) |
| `create-supplier-order` | Places order with peptide supplier |

## Automation / Health (11)

| Function | Purpose | Trigger |
|----------|---------|---------|
| `run-automations` | Executes automation rules | Manual/scheduled |
| `check-low-supply` | Alerts on low lot quantities | Daily cron |
| `check-payment-emails` | Scans inbox for Zelle/Venmo matches | Scheduled |
| `sentinel-worker` | 16-phase self-healing (2,440 lines) | `*/2 * * * *` |
| `meta-sentinel` | Self-monitoring + adaptive thresholds | `*/30 * * * *` |
| `health-probe` | 40+ health checks, 12 categories | `*/5 * * * *` |
| `health-digest` | Daily HTML health email | `0 7 * * *` |
| `code-patcher` | GitHub code repair (branch → PR → merge) | On-demand |
| `boot-failure` | Boot crash → auto-rollback | On-demand |
| `synthetic-monitor` | External content check + rollback | `*/5 * * * *` |
| `deploy-webhook` | Triggers Vercel redeploy | CI/CD |

## Deploy Commands

```bash
supabase functions deploy <function-name>    # Single
supabase functions deploy                     # All
supabase functions logs <name> --tail         # Logs
```

## Adding a New Function

1. `supabase functions new <name>`
2. Create `config.toml` with `verify_jwt = false`
3. Import from `_shared/` (auth, cors)
4. Scope all DB ops to `orgId` from `authenticate(req)`
5. Deploy and add to this reference
