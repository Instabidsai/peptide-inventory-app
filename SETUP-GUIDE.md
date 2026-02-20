# Peptide Inventory App — Complete Setup Guide

Every account, credential, and login needed to run the platform for a new tenant (peptide company).

---

## 1. Supabase (Database + Auth + Edge Functions)

### What you need
| Variable | Type | Where to get it |
|----------|------|----------------|
| `VITE_SUPABASE_URL` | Public | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Public | Supabase Dashboard → Settings → API → `anon` `public` key |
| `SUPABASE_URL` | Secret (server) | Same as VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | Supabase Dashboard → Settings → API → `service_role` key |
| `DATABASE_URL` | **SECRET** | Supabase Dashboard → Settings → Database → Connection string (Transaction pooler) |

### Setup steps
1. Go to [supabase.com](https://supabase.com) → New Project
2. Pick region closest to your customers (e.g. `us-east-1`)
3. Save the database password — you'll need it for `DATABASE_URL`
4. Run the SQL migrations in order (see Section 9 below)
5. Deploy edge functions: `npx supabase functions deploy` from the project root

### Edge functions that need deploying
These live in `supabase/functions/` and are deployed with `supabase functions deploy`:
- `chat-with-ai` — AI peptide assistant (needs `OPENAI_API_KEY` secret)
- `admin-ai-chat` — Admin AI assistant (needs `OPENAI_API_KEY` secret)
- `analyze-food` — Food/macro analysis (needs `OPENAI_API_KEY` secret)
- `process-health-document` — Health document processor (needs `OPENAI_API_KEY` secret)
- `invite-user` — Send invitation emails
- `exchange-token` — Redeem invite tokens
- `promote-contact` — Promote contact to partner
- `provision-tenant` — Create new tenant organizations

Set edge function secrets:
```bash
supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

---

## 2. Stripe (Subscription Billing + One-Time Payments)

### What you need
| Variable | Type | Where to get it |
|----------|------|----------------|
| `STRIPE_SECRET_KEY` | **SECRET** | Stripe Dashboard → Developers → API Keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | **SECRET** | Stripe Dashboard → Developers → Webhooks → Signing secret |

### Setup steps
1. Create account at [stripe.com](https://stripe.com)
2. Complete identity verification (required for live payments)
3. Go to Developers → API Keys → copy the **Secret key** (`sk_live_...`)
4. Create webhook endpoint:
   - URL: `https://your-app.vercel.app/api/webhooks/stripe`
   - Events to listen for:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_...`)
5. Create subscription products/prices:
   - Go to Products → Add product for each tier
   - Create a **monthly** and **yearly** recurring price for each
   - Copy each Price ID (`price_...`) and update the `subscription_plans` table:
     ```sql
     UPDATE subscription_plans SET stripe_monthly_price_id = 'price_xxx', stripe_yearly_price_id = 'price_yyy' WHERE name = 'starter';
     UPDATE subscription_plans SET stripe_monthly_price_id = 'price_xxx', stripe_yearly_price_id = 'price_yyy' WHERE name = 'professional';
     UPDATE subscription_plans SET stripe_monthly_price_id = 'price_xxx', stripe_yearly_price_id = 'price_yyy' WHERE name = 'enterprise';
     ```

### Subscription tiers (pre-seeded)
| Plan | Monthly | Yearly | Users | Peptides | Orders/mo |
|------|---------|--------|-------|----------|-----------|
| Free Trial | $0 | $0 | 2 | 10 | 50 |
| Starter | $99 | $999 | 5 | 50 | 500 |
| Professional | $199 | $1,999 | 25 | 200 | 2,000 |
| Enterprise | $499 | $4,999 | Unlimited | Unlimited | Unlimited |

---

## 3. PsiFi (Alternative Payment Processor — Optional)

Only needed if using PsiFi instead of/alongside Stripe for one-time payments.

| Variable | Type | Where to get it |
|----------|------|----------------|
| `PSIFI_API_KEY` | **SECRET** | PsiFi Dashboard → Settings → API Keys |
| `PSIFI_WEBHOOK_SECRET` | **SECRET** | PsiFi Dashboard → Settings → Webhooks |

### Setup steps
1. Create account at [psifi.app](https://psifi.app)
2. Go to Settings → API Keys → generate a key
3. Create webhook:
   - URL: `https://your-app.vercel.app/api/webhooks/psifi`
   - Events: `order.completed`, `order.failed`
   - Copy the webhook secret (`whsec_...`)

---

## 4. OpenAI (AI Chat + Food Analysis)

| Variable | Type | Where to get it |
|----------|------|----------------|
| `OPENAI_API_KEY` | **SECRET** | OpenAI Dashboard → API Keys |

### Setup steps
1. Create account at [platform.openai.com](https://platform.openai.com)
2. Add a payment method (API usage is pay-per-use)
3. Go to API Keys → Create new secret key
4. Set spending limits in Settings → Limits (recommended: $50/month to start)
5. This key is used by 4 Supabase edge functions (see Section 1)

---

## 5. Shippo (Shipping Labels — Optional)

| Variable | Type | Where to get it |
|----------|------|----------------|
| `SHIPPO_API_KEY` | **SECRET** | Shippo Dashboard → Settings → API |

### Setup steps
1. Create account at [goshippo.com](https://goshippo.com)
2. Add your carrier accounts (USPS is free, UPS/FedEx need accounts)
3. Go to Settings → API → copy the Live API token
4. Set the `SHIP_FROM_*` variables with your warehouse/return address
5. Enable tracking notifications in Settings → Tracking

---

## 6. Email Service (Transactional Email — Optional)

| Variable | Type | Where to get it |
|----------|------|----------------|
| `SMTP_RELAY_URL` | **SECRET** | Your email provider's API endpoint |

Without this, emails are logged to console but not delivered. Options:

### Option A: Resend (recommended — easiest)
1. Create account at [resend.com](https://resend.com)
2. Verify your domain (add DNS records)
3. Get API key from Dashboard → API Keys
4. Set `SMTP_RELAY_URL=https://api.resend.com/emails`
5. Add API key to the `tenant_api_keys` table or pass in headers

### Option B: SendGrid
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Verify sender identity
3. Get API key from Settings → API Keys
4. Set appropriate relay URL

### Per-tenant SMTP
Each tenant can configure their own email provider via Settings → Integrations → SMTP. This is stored in the `tenant_api_keys` table and overrides the platform default.

---

## 7. Vercel (Hosting + Serverless Functions)

### Setup steps
1. Create account at [vercel.com](https://vercel.com)
2. Import the GitHub repo (`Instabidsai/peptide-inventory-app`)
3. Set framework to **Vite**
4. Add ALL environment variables from `.env.example` in Vercel Dashboard → Settings → Environment Variables
5. Deploy

### Environment variables to set in Vercel
These go in Vercel Dashboard → Project → Settings → Environment Variables:

**Required:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL` (your Vercel domain, e.g. `https://app.peptidecompany.com`)

**Payment (at least one):**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PSIFI_API_KEY` (optional)
- `PSIFI_WEBHOOK_SECRET` (optional)

**Optional:**
- `SHIPPO_API_KEY`
- `SHIP_FROM_NAME`, `SHIP_FROM_STREET`, etc.
- `SMTP_RELAY_URL`
- `OPENAI_API_KEY` (also needed as Supabase secret, but some functions use it via Vercel too)

### Custom domain
1. Vercel Dashboard → Project → Settings → Domains
2. Add your domain (e.g. `app.yourcompany.com`)
3. Add the DNS records Vercel provides (CNAME or A record)

---

## 8. User Accounts & Roles

### Role hierarchy
| Role | Access | How to create |
|------|--------|---------------|
| `super_admin` | Full platform access — all tenants, billing, provisioning | SQL insert (see below) |
| `admin` | Tenant admin — manage their org's inventory, users, orders | Provisioning flow or SQL |
| `sales_rep` | Sales dashboard, create orders, manage contacts | Admin invites via UI |
| `partner` | Partner portal, commission tracking | Promoted from contact via UI |
| `client` | Client portal — view orders, track protocol, AI chat | Invited by admin/sales rep |

### Creating the first super_admin
After running migrations, create your platform admin:

1. **Sign up** through the app's auth page (creates a Supabase auth user)
2. **Get the user ID** from Supabase Dashboard → Authentication → Users
3. **Assign super_admin role:**
```sql
-- Replace with your actual user ID and org ID
INSERT INTO user_roles (user_id, org_id, role)
VALUES ('your-user-uuid-here', 'your-org-uuid-here', 'super_admin')
ON CONFLICT (user_id, org_id) DO UPDATE SET role = 'super_admin';
```

### Creating a tenant (new peptide company)
As super_admin:
1. Go to Vendor Dashboard → "Provision New Tenant"
2. Fill in: company name, admin email, admin name
3. System creates: organization, tenant_config, user_roles, default pricing tier
4. Admin receives invite email (or if no SMTP, manually share the login URL)

### Inviting users to a tenant
As tenant admin:
1. Go to Contacts → select contact → "Invite to Portal"
2. Or go to Settings → Users → "Invite User"
3. User receives email with magic link (or password setup)

---

## 9. SQL Migrations (Run in Order)

Run these in Supabase Dashboard → SQL Editor, in this exact order:

```
1. scripts/20260219_super_admin_role.sql     — Adds super_admin role, pricing_tiers table, RLS policies
2. scripts/20260219_tenant_api_keys.sql      — Tenant API key storage for per-tenant integrations
3. scripts/20260219_subscription_plans.sql   — Subscription tiers, billing events, Stripe Price ID columns
4. scripts/20260219_expenses_org_id.sql      — Multi-tenant expenses isolation
```

These are idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — safe to re-run.

---

## 10. Quick Start Checklist

For a new deployment from scratch:

- [ ] Create Supabase project, copy URL + keys
- [ ] Run all 4 SQL migrations in order
- [ ] Deploy edge functions: `npx supabase functions deploy`
- [ ] Set Supabase secret: `supabase secrets set OPENAI_API_KEY=sk-...`
- [ ] Create Stripe account, get secret key + webhook secret
- [ ] Create Stripe products/prices, update `subscription_plans` table with Price IDs
- [ ] Create Vercel project, import repo, set all env vars
- [ ] Set custom domain in Vercel + DNS
- [ ] Sign up through the app, assign yourself `super_admin` via SQL
- [ ] Provision your first tenant via the Vendor Dashboard
- [ ] (Optional) Set up Shippo for shipping labels
- [ ] (Optional) Set up Resend/SendGrid for transactional email
- [ ] (Optional) Set up PsiFi for crypto payments
- [ ] Test: login → create order → checkout → webhook → order marked paid

---

## 11. Per-Tenant Configuration (Settings Page)

Each tenant can customize via Settings:

**Branding tab:**
- Company name, logo URL, primary color, support email

**Integrations tab:**
- Stripe keys (overrides platform default)
- PsiFi keys (overrides platform default)
- Shippo API key
- SMTP relay URL
- WooCommerce credentials

**Users tab:**
- Invite new users
- Manage roles

All per-tenant keys are stored in `tenant_api_keys` table and used by the payment provider factory to resolve the correct processor per org.

---

## 12. Ongoing Costs Estimate

| Service | Free Tier | Typical Cost |
|---------|-----------|-------------|
| Supabase | 500MB DB, 50K auth users | $25/mo (Pro) |
| Vercel | 100GB bandwidth | $20/mo (Pro) |
| Stripe | No monthly fee | 2.9% + $0.30 per transaction |
| OpenAI | None | ~$5-20/mo per 1000 AI chats |
| Shippo | Free for label generation | Per-label cost varies by carrier |
| Resend | 3,000 emails/mo free | $20/mo for 50K emails |
| Custom domain | N/A | ~$12/yr |

**Total minimum to launch: ~$57/mo** (Supabase Pro + Vercel Pro + domain)
