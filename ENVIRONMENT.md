# Environment Variables Reference

Complete reference of all environment variables and secrets for ThePeptideAI.

## Vercel Environment Variables

These are set in your Vercel project settings (Settings → Environment Variables).

### Required

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Supabase → Settings → API → `anon` `public` key |
| `SUPABASE_URL` | Supabase project URL (server-side) | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) | Supabase → Settings → API → `service_role` key |
| `OPENAI_API_KEY` | OpenAI API key for AI features | [platform.openai.com](https://platform.openai.com/api-keys) |
| `STRIPE_SECRET_KEY` | Stripe secret key | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe → Developers → Webhooks → Signing secret |
| `PUBLIC_SITE_URL` | Your production URL (e.g., `https://app.yourco.com`) | Your domain |
| `DEFAULT_ORG_ID` | Your organization UUID | From `organizations` table after running seed script |

### Optional — Payments

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `PSIFI_API_KEY` | PsiFi payment processor API key | PsiFi dashboard |
| `PSIFI_WEBHOOK_SECRET` | PsiFi webhook signing secret | PsiFi dashboard |

### Optional — Shipping (Shippo)

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `SHIPPO_API_KEY` | Shippo API key for label generation | [Shippo Dashboard](https://app.goshippo.com/settings/api) |
| `SHIP_FROM_NAME` | Sender name on shipping labels | Your business name |
| `SHIP_FROM_STREET` | Sender street address | Your address |
| `SHIP_FROM_CITY` | Sender city | Your city |
| `SHIP_FROM_STATE` | Sender state (2-letter code) | e.g., `FL` |
| `SHIP_FROM_ZIP` | Sender ZIP code | e.g., `33000` |
| `SHIP_FROM_COUNTRY` | Sender country (2-letter code) | e.g., `US` |
| `SHIP_FROM_PHONE` | Sender phone number | Your phone |
| `SHIP_FROM_EMAIL` | Sender email | Your email |

> Note: Shipping address can also be set per-tenant in the `tenant_config` table, which takes priority over env vars.

### Optional — WooCommerce Sync

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `WOO_URL` | WooCommerce store URL | e.g., `https://shop.yourco.com` |
| `WOO_USER` | WooCommerce admin email | WordPress admin email |
| `WOO_APP_PASS` | WooCommerce application password | WordPress → Users → Application Passwords |
| `WOO_WEBHOOK_SECRET` | WooCommerce webhook secret | WooCommerce → Settings → Advanced → Webhooks |

### Optional — Email

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `SMTP_RELAY_URL` | Email API endpoint | e.g., `https://api.resend.com/emails` |

### Optional — Database Direct

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `DATABASE_URL` | Direct Postgres connection string | Supabase → Settings → Database → Connection string |

---

## Supabase Edge Function Secrets

These are set via `supabase secrets set` or in the Supabase dashboard (Edge Functions → Secrets).

### Required for All Edge Functions

| Secret | Used By |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | All 15 functions |
| `ALLOWED_ORIGINS` | All 15 functions (CORS) |

### Required for AI Features

| Secret | Used By |
|--------|---------|
| `OPENAI_API_KEY` | admin-ai-chat, ai-builder, analyze-food, chat-with-ai, check-payment-emails, partner-ai-chat, process-health-document |
| `BRAND_NAME` | admin-ai-chat, chat-with-ai, partner-ai-chat |

### Required for Auth/Invites

| Secret | Used By |
|--------|---------|
| `PUBLIC_SITE_URL` | exchange-token, invite-user |
| `SUPABASE_ANON_KEY` | analyze-food, chat-with-ai, process-health-document, run-automations |

### Required for Integrations

| Secret | Used By |
|--------|---------|
| `COMPOSIO_API_KEY` | check-payment-emails, composio-connect, provision-tenant |
| `APP_URL` | composio-callback |

---

## Edge Function → Secret Matrix

| Function | OPENAI | SVC_ROLE | ANON | ORIGINS | BRAND | SITE_URL | COMPOSIO | APP_URL |
|----------|--------|----------|------|---------|-------|----------|----------|---------|
| admin-ai-chat | x | x | | x | x | | | |
| ai-builder | x | x | | x | | | | |
| analyze-food | x | | x | x | | | | |
| chat-with-ai | x | x | x | x | x | | | |
| check-payment-emails | x | x | | x | | | x | |
| composio-callback | | x | | | | | | x |
| composio-connect | | x | | x | | | x | |
| exchange-token | | x | | x | | x | | |
| invite-user | | x | | x | | x | | |
| partner-ai-chat | x | x | | x | x | | | |
| process-health-document | x | x | x | x | | | | |
| promote-contact | | x | | x | | | | |
| provision-tenant | | x | | x | | | x | |
| run-automations | | x | x | x | | | | |
| self-signup | | x | | x | | | | |

---

## Notes

- **`VITE_` prefix**: Variables starting with `VITE_` are exposed to the frontend JavaScript bundle. Never put secrets in `VITE_` variables.
- **Service role key**: This key bypasses Row Level Security. Keep it server-side only (Vercel API routes, edge functions). Never expose to the frontend.
- **Shipping fallback**: The `SHIP_FROM_*` env vars are fallbacks. Per-tenant shipping addresses in `tenant_config` take priority.
- **`DEFAULT_ORG_ID`**: Used by WooCommerce webhook to know which tenant incoming orders belong to. Multi-tenant deployments may need a different approach (webhook per tenant).
