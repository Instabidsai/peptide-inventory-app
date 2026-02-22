# Deployment Guide

Step-by-step guide to deploy ThePeptideAI to production.

## Overview

ThePeptideAI uses two services:
1. **Supabase** — Database, authentication, edge functions, file storage
2. **Vercel** — Frontend hosting, serverless API routes

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a region close to your users
3. Set a strong database password (save it — you'll need it for `DATABASE_URL`)
4. Once created, go to **Settings → API** and note:
   - Project URL (`https://YOUR_PROJECT.supabase.co`)
   - `anon` public key
   - `service_role` secret key

## Step 2: Set Up Database Schema

1. Go to **SQL Editor** in your Supabase dashboard
2. Run `scripts/schema-master.sql` — this creates all 57 tables, functions, triggers, indexes, and RLS policies
3. Run `scripts/seed-subscription-plans.sql` — this seeds the 4 subscription tiers

Verify: Go to **Table Editor** and confirm tables like `organizations`, `tenant_config`, `peptides`, `contacts`, `orders` exist.

## Step 3: Configure Supabase Auth

1. Go to **Authentication → Providers**
2. Enable **Email** provider (enabled by default)
3. Go to **Authentication → URL Configuration**
4. Set **Site URL** to your production domain (e.g., `https://app.yourcompany.com`)
5. Add redirect URLs:
   - `https://app.yourcompany.com`
   - `https://app.yourcompany.com/#/`
   - `http://localhost:8080` (for local development)

## Step 4: Deploy Edge Functions

Deploy all 15 Supabase Edge Functions:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Deploy all functions
supabase functions deploy admin-ai-chat --project-ref YOUR_PROJECT_ID
supabase functions deploy ai-builder --project-ref YOUR_PROJECT_ID
supabase functions deploy analyze-food --project-ref YOUR_PROJECT_ID
supabase functions deploy chat-with-ai --project-ref YOUR_PROJECT_ID
supabase functions deploy check-payment-emails --project-ref YOUR_PROJECT_ID
supabase functions deploy composio-callback --project-ref YOUR_PROJECT_ID
supabase functions deploy composio-connect --project-ref YOUR_PROJECT_ID
supabase functions deploy exchange-token --project-ref YOUR_PROJECT_ID
supabase functions deploy invite-user --project-ref YOUR_PROJECT_ID
supabase functions deploy partner-ai-chat --project-ref YOUR_PROJECT_ID
supabase functions deploy process-health-document --project-ref YOUR_PROJECT_ID
supabase functions deploy promote-contact --project-ref YOUR_PROJECT_ID
supabase functions deploy provision-tenant --project-ref YOUR_PROJECT_ID
supabase functions deploy run-automations --project-ref YOUR_PROJECT_ID
supabase functions deploy self-signup --project-ref YOUR_PROJECT_ID
```

Set edge function secrets:

```bash
supabase secrets set \
  OPENAI_API_KEY=sk-your-key \
  SUPABASE_SERVICE_ROLE_KEY=eyJ...your-key \
  SUPABASE_ANON_KEY=eyJ...your-key \
  ALLOWED_ORIGINS=https://app.yourcompany.com \
  BRAND_NAME="Your Brand Name" \
  PUBLIC_SITE_URL=https://app.yourcompany.com \
  APP_URL=https://app.yourcompany.com \
  --project-ref YOUR_PROJECT_ID
```

Optional secrets (if using these features):
```bash
supabase secrets set \
  COMPOSIO_API_KEY=your-key \
  --project-ref YOUR_PROJECT_ID
```

## Step 5: Deploy to Vercel

### Option A: Deploy Button (Recommended)

Click the Deploy button in the README (if available), or:

### Option B: Manual Deploy

1. Push code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and create a new project
3. Import your GitHub repository
4. Set the **Framework Preset** to `Vite`
5. Set environment variables (see [ENVIRONMENT.md](./ENVIRONMENT.md) for the full list):

**Required Vercel env vars:**
| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Your Stripe webhook signing secret |
| `PUBLIC_SITE_URL` | Your production URL |
| `DEFAULT_ORG_ID` | Your organization UUID (created in Step 7) |

6. Click **Deploy**

## Step 6: Set Up Stripe

1. Create a [Stripe](https://stripe.com) account (or use test mode)
2. Run the setup script to create products and prices:

```bash
STRIPE_SECRET_KEY=sk_test_... \
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npx tsx scripts/setup-stripe.ts
```

3. Add a webhook endpoint in **Stripe Dashboard → Developers → Webhooks**:
   - URL: `https://your-vercel-domain.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET` in Vercel

## Step 7: Create First Tenant

1. Edit `scripts/seed-new-tenant.sql` — replace all `{{PLACEHOLDERS}}` with your values:
   - `{{ORG_NAME}}` — your company name
   - `{{BRAND_NAME}}` — display name for your customers
   - `{{SUPPORT_EMAIL}}` — support email address
   - `{{APP_URL}}` — your production URL
   - `{{SHIP_FROM_*}}` — your shipping address
   - etc.
2. Run the SQL in Supabase SQL Editor
3. Copy the returned `org_id` UUID
4. Set `DEFAULT_ORG_ID` in your Vercel environment variables

## Step 8: Create Admin User

Option A: Use the **self-signup** edge function by navigating to your site's signup page.

Option B: Manually create a user in **Supabase → Authentication → Users → Add User**, then run:
```sql
INSERT INTO profiles (id, user_id, full_name, org_id, role)
VALUES (gen_random_uuid(), 'USER_AUTH_ID', 'Admin Name', 'YOUR_ORG_ID', 'admin');

INSERT INTO user_roles (user_id, org_id, role)
VALUES ('USER_AUTH_ID', 'YOUR_ORG_ID', 'admin');
```

## Step 9: Configure Your Tenant

1. Log in as admin
2. Go to **Settings** → configure:
   - Company branding (logo, colors)
   - Shipping address
   - Payment methods (Stripe keys, Venmo/CashApp handles)
   - AI assistant settings
3. Add peptides to your inventory
4. Invite team members

## Step 10: Verify Everything Works

- [ ] Can sign in as admin
- [ ] Dashboard loads with correct branding
- [ ] Can add/edit peptides
- [ ] Can create contacts
- [ ] Can create orders
- [ ] AI chat responds (requires OpenAI key)
- [ ] Shipping label generation works (requires Shippo key)
- [ ] Subscription checkout redirects to Stripe (requires Stripe setup)

## Troubleshooting

**Build fails on Vercel**: Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (the frontend needs these at build time).

**Edge functions return 500**: Check that all secrets are set via `supabase secrets list --project-ref YOUR_PROJECT_ID`.

**Auth redirects loop**: Verify the Site URL in Supabase Auth settings matches your actual domain.

**Stripe webhooks fail**: Ensure the webhook URL includes `/api/webhooks/stripe` (not just the domain). Check that `STRIPE_WEBHOOK_SECRET` matches what Stripe shows.
