# ThePeptideAI

A complete, multi-tenant SaaS platform for peptide research companies. Manage inventory, clients, sales, partners, shipping, and AI-powered customer interactions — all from one white-labeled dashboard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FInstabidsai%2Fpeptide-inventory-app&env=VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,OPENAI_API_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,PUBLIC_SITE_URL,DEFAULT_ORG_ID&envDescription=See%20ENVIRONMENT.md%20for%20details%20on%20each%20variable&envLink=https%3A%2F%2Fgithub.com%2FInstabidsai%2Fpeptide-inventory-app%2Fblob%2Fmain%2FENVIRONMENT.md&project-name=peptide-ai&framework=vite)

## Features

**Inventory & Operations**
- Peptide catalog with lots, bottles, concentrations, and custom fields
- Sales orders with fulfillment center and shipping label generation (Shippo)
- WooCommerce sync for existing e-commerce stores
- Payment processing via Stripe and PsiFi (crypto-friendly)
- Payment email scanner (auto-match bank payments to orders)

**CRM & Clients**
- Contact management with protocol builder
- Client portal: store, health tracking, macro tracker, AI chat
- Household system (family accounts under one umbrella)

**Partners & Affiliates**
- 3-tier commission system with automatic calculations
- Partner portal: store, dashboard, downline tracking
- Partner AI chat assistant

**AI-Powered**
- Client-facing AI chat with RAG (retrieval-augmented generation)
- Admin AI assistant for operations
- AI builder: describe a feature in English, AI builds it
- Photo-based food/macro analysis

**Multi-Tenancy**
- Full tenant isolation via `org_id` + Row Level Security
- Per-tenant branding (logo, colors, company name)
- Per-tenant configuration (shipping address, payment methods, AI prompts)
- Subscription billing (Free / Starter / Professional / Enterprise)
- Super-admin vendor dashboard for managing all tenants

**Automations**
- Payment email scanner (scheduled)
- Low stock alerts
- Order auto-fulfillment
- Commission auto-calculation
- Custom automation modules per tenant

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions, Storage) |
| API Routes | Vercel Serverless Functions (Node.js) |
| Payments | Stripe (subscriptions + one-time), PsiFi (crypto) |
| Shipping | Shippo API |
| AI | OpenAI GPT-4o (chat, food analysis, builder) |
| Deployment | Vercel (frontend + API), Supabase (database + auth + edge functions) |

## Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) account (free tier works for development)
- A [Stripe](https://stripe.com) account (test mode for development)
- An [OpenAI](https://platform.openai.com) API key
- A [Vercel](https://vercel.com) account (for deployment)
- Optional: [Shippo](https://goshippo.com) account (shipping labels)
- Optional: WooCommerce store (if syncing existing products)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Instabidsai/peptide-inventory-app.git
cd peptide-inventory-app
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your Supabase, Stripe, and OpenAI credentials

# 3. Set up database (see DEPLOY.md for full guide)
# Run scripts/schema-master.sql in your Supabase SQL editor
# Run scripts/seed-subscription-plans.sql

# 4. Start development server
npm run dev
```

For complete deployment instructions, see **[DEPLOY.md](./DEPLOY.md)**.

For environment variable reference, see **[ENVIRONMENT.md](./ENVIRONMENT.md)**.

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── hooks/              # React hooks (data fetching, auth, etc.)
│   ├── pages/              # Page components (admin, client, partner, vendor)
│   ├── integrations/       # Supabase client setup
│   └── utils/              # Utilities
├── api/                    # Vercel API routes (serverless)
│   ├── billing/            # Subscription checkout
│   ├── checkout/           # Product checkout
│   ├── payments/           # Payment provider abstraction
│   ├── shipping/           # Shippo integration (rates, labels)
│   └── webhooks/           # Stripe, PsiFi, WooCommerce webhooks
├── supabase/
│   ├── functions/          # 15 Supabase Edge Functions
│   ├── migrations/         # Database migration files
│   └── config.toml         # Supabase project config
├── scripts/                # Setup and utility scripts
│   ├── schema-master.sql   # Complete database schema (57 tables)
│   ├── seed-subscription-plans.sql
│   ├── seed-new-tenant.sql
│   └── setup-stripe.ts     # Stripe product/price setup
└── .env.example            # Environment variable template
```

## Subscription Tiers

| Plan | Monthly | Yearly | Users | Peptides | Orders/mo |
|------|---------|--------|-------|----------|-----------|
| Free Trial | $0 | $0 | 2 | 10 | 50 |
| Starter | $99 | $999 | 5 | 50 | 500 |
| Professional | $199 | $1,999 | 25 | 200 | 2,000 |
| Enterprise | $499 | $4,999 | Unlimited | Unlimited | Unlimited |

## License

Proprietary. See LICENSE file for details.
