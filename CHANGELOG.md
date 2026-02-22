# Changelog

All notable changes to Peptide CRM will be documented in this file.

## [1.0.0] — 2026-02-22

### Initial Release

**Core Platform**
- Multi-tenant architecture with per-organization data isolation (RLS)
- 57-table database schema with full migration support
- 4 subscription tiers: Free, Starter, Professional, Enterprise
- Role-based access: super_admin, admin, staff, viewer, client, partner
- White-label branding via tenant_config (logo, colors, brand name)
- Custom fields engine (add fields to peptides, contacts, orders)

**Inventory & Operations**
- Peptide catalog with lots, bottles, concentrations, pricing tiers
- Movement tracking (receive, sell, transfer, adjust, waste)
- Barcode/QR scanning for bottle lookup
- Shipping integration via Shippo (label creation, tracking)
- WooCommerce order sync

**CRM & Sales**
- Contact management with protocol builder
- Sales orders with fulfillment workflow
- Partner/affiliate 3-tier commission system
- Client portal (store, health tracking, macro tracker)
- Partner portal (store, dashboard, downline tracking)
- Household system (family accounts)

**AI Features**
- Client AI chat assistant (RAG-powered, per-tenant knowledge base)
- Admin AI chat assistant
- Partner AI chat assistant
- AI Builder: describe a feature in English, AI builds it
- Food/macro photo analysis (GPT-4o Vision)
- Payment email scanner (auto-match payments to orders)

**Payments**
- Stripe subscription billing (checkout, webhooks, portal)
- PsiFi payment provider (alternative processor)
- Zelle/Venmo manual payment tracking
- Per-tenant payment provider configuration

**Deployment**
- One-click Vercel deploy with environment variable prompts
- 15 Supabase Edge Functions (all secrets via env vars)
- GitHub Actions CI (type-check, test, build)
- Deployment validation script
- Complete documentation (README, DEPLOY, ENVIRONMENT)

**Security**
- Row Level Security on all tables
- No hardcoded secrets in source code
- Security headers (CSP-ready, X-Frame-Options, nosniff)
- Supabase Auth with email confirmation + magic links
