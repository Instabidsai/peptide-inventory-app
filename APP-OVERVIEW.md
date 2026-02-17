# Peptide Inventory App — Complete Feature Overview

**URL**: https://thepeptideai.com (Vercel)
**Stack**: React 18 + TypeScript + Vite + Supabase + TanStack Query + shadcn/ui
**Database**: Supabase (PostgreSQL + Row-Level Security + Edge Functions)
**Payments**: PsiFi processor
**Shipping**: Shippo API (USPS Priority, FedEx, UPS)
**WooCommerce Sync**: Polls shop.pureuspeptide.com every 15 min
**Repo**: github.com/Instabidsai/peptide-inventory-app

---

## What This App Is

A full-stack **B2B/B2C platform** for a peptide research supply company. It combines:

- **Inventory & warehouse management** (lot tracking, bottle-level UIDs)
- **Sales order processing** with automated shipping labels
- **Multi-tier affiliate/commission system** with downline tracking and payouts
- **Client health portal** with protocol tracking, AI-powered nutrition logging, body composition
- **CRM** with contacts, notes, rep assignments
- **WooCommerce integration** syncing orders from the WordPress storefront
- **Per-order profit tracking** (Revenue - COGS - Shipping - Commission = Net Profit)
- **Financial dashboard** with investment vs. operations views

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Everything — inventory, orders, finances, partners, all client data |
| **Staff** | Operational access — inventory movements, orders, contacts |
| **Sales Rep** | Partner portal — their orders, their clients, commissions, downline |
| **Customer** | Client portal — protocols, nutrition tracking, store, messages |
| **Viewer** | Read-only access |

---

## Feature Breakdown

### 1. Inventory Management

- **Peptide catalog** — CRUD with SKU, pricing tiers (retail/wholesale/at_cost), active/inactive
- **Lot tracking** — batch numbers, cost per unit, received/expiry dates, quantities
- **Bottle-level tracking** — individual bottle UIDs, status (in_stock, sold, given_away, internal_use, lost, returned, expired), location tracking
- **Inventory movements** — sales, giveaways, internal use, losses, returns. Each movement tracks payment status, method, amount paid
- **Batch movement wizard** — quick entry for processing multiple items
- **Inventory statistics** — real-time bottle counts via Supabase RPC (bypasses 1000-row limit), cost-basis valuation

### 2. Sales Orders

- **Order creation** — multi-item orders linked to contacts and reps
- **Status workflow**: draft → submitted → fulfilled → cancelled
- **Payment tracking**: unpaid → partial → paid (via PsiFi processor)
- **Shipping integration**: auto-creates Shippo labels for fulfilled orders, tracks carrier/tracking number/ship date/delivery
- **WooCommerce sync**: orders from shop.pureuspeptide.com auto-import with contact matching, product matching, COGS calculation
- **Order source tagging**: `app` vs `woocommerce` with filter in UI
- **Per-order financials**: COGS (from avg lot costs), shipping cost, commission, net profit, margin %

### 3. Purchase Orders (Supplier Side)

- Order peptides from suppliers
- Track expected arrival, tracking numbers
- Mark as received with actual costs
- Status: pending → received → cancelled

### 4. Multi-Tier Affiliate / Commission System

- **Partner tiers**: Senior, Standard, Associate, Executive
- **Commission rates**: configurable per partner (percentage of sale)
- **Discount tiers**: 25%, 35%, 50% off retail
- **Overhead per unit**: per-partner markup tracking
- **Price multiplier**: custom pricing per partner
- **Upline/downline relationships**: multi-level network structure
- **Commission lifecycle**: pending → available → paid / applied_to_debt
- **Credit balance management**: partners can accumulate credit
- **Batch payout tracking**: bulk commission disbursement
- **Commission statistics**: total earned, pending, available, paid out
- **Downline visualization**: network depth, direct reports, team structure
- **Partner portal**: personal dashboard with balance, commissions, orders, and (for senior partners) a store

### 5. Client Health Portal

- **Protocol management**: admin creates protocol templates with peptide items, dosages (mg/mcg), frequencies (daily/weekly/etc.), durations
- **Protocol assignment**: assign protocols to client contacts
- **Protocol logging**: clients log intake (taken/skipped/missed) with dosages, notes, timestamps
- **Adherence tracking**: daily and weekly compliance metrics
- **Client inventory**: peptide vials assigned per client, quantity and concentration tracking
- **Client regimen view**: current protocols, dosage/frequency, duration remaining, cost summary
- **Client dashboard**: today's compliance, weekly progress, active protocols, health overview

### 6. AI-Powered Nutrition Tracking

- **Food photo upload** → AI analyzes image and estimates macros (via Supabase Edge Function + OpenAI)
- **Manual food entry** with calorie/protein/carbs/fat
- **Barcode scanning** via OpenFoodFacts API
- **Daily macro aggregation** with progress bars vs. customizable goals
- **Water intake logging** with daily targets
- **Body composition tracking**: weight, measurements, progress photos with timeline
- **Meal templates**: save and quick-add favorite meals

### 7. CRM / Contacts

- **Contact types**: customer, partner, internal
- **Full profiles**: name, email, phone, company, address
- **Rep assignment**: link contacts to sales reps
- **Contact notes**: timestamped notes with creator tracking
- **Account linking**: claim tokens (7-day expiry) let contacts create login accounts and link to their profile
- **Contact search and filtering**

### 8. Client Store & Checkout

- **Browsable peptide catalog** for logged-in clients
- **Shopping cart** with quantity adjustment
- **Checkout flow**: shipping address → order notes → total/commission display → PsiFi payment redirect
- **Success/cancel pages** after payment
- **Order history** for clients with status, tracking, payment info

### 9. Client Requests & Feedback

- **Request types**: general inquiry, product request, regimen help
- **Request workflow**: pending → approved → fulfilled → rejected → archived
- **Admin management**: approve/reject, add notes, link to inventory movements for fulfillment
- **Protocol feedback**: ratings + comments from clients, admin responses
- **Read status tracking** for client-admin communication

### 10. Messaging & Notifications

- **Message threads** between clients and admin/reps
- **Unread tracking** and message history
- **Protocol reminders** and order status notifications
- **Community features**: discussion topics and forum messages

### 11. Resources & Education

- **Resource library**: articles, videos, educational content
- **Topic-based organization** with search and filtering
- **Featured carousel**, latest uploads, popular resources
- **Admin management**: upload, categorize, link to peptides
- **Resource themes**: custom theme creation synced to peptides

### 12. Financial Dashboard

- **Inventory valuation**: total asset value at cost basis
- **Revenue tracking**: all sales aggregated
- **COGS computation**: cost of goods from lot purchase prices
- **Expense tracking**: categorized expenses with vendor/date/method
- **Commission tracking**: paid vs owed vs applied
- **Net profit calculation**: revenue - COGS - expenses - commissions
- **Two views**: Investment (full picture) and Operations (streamlined)
- **Per-order profit**: Revenue - COGS - Shipping - Commission = Net Profit with margin %

### 13. Shipping Pipeline

- **Automated label creation**: Shippo API creates labels for fulfilled orders
- **Rate selection**: prefers USPS Priority, falls back to cheapest
- **Address parsing**: handles "Street, City, ST ZIP" format
- **Tracking updates**: polls Shippo for delivery status (label_created → in_transit → delivered)
- **Cost tracking**: shipping cost per order feeds into profit calculation
- **Error handling**: marks failed labels with error message, retries on next run

### 14. WooCommerce Integration

- **Polling sync**: every 15 minutes, fetches orders from shop.pureuspeptide.com WooCommerce REST API
- **Contact matching**: matches by email, creates new contacts if needed
- **Product matching**: maps WooCommerce product names to peptides table (fuzzy match, strips dosage suffixes)
- **Status mapping**: WC processing→submitted, completed→fulfilled, on-hold→draft, cancelled→cancelled
- **COGS calculation**: uses average lot cost per peptide
- **Deduplication**: unique index on woo_order_id prevents duplicate imports
- **Idempotent**: safe to run repeatedly

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `peptides` | Master product catalog |
| `lots` | Batch/lot purchases with cost tracking |
| `bottles` | Individual bottle inventory with UID |
| `inventory_movements` | Stock in/out with payment tracking |
| `sales_orders` | Customer orders (app + WooCommerce) |
| `sales_order_items` | Line items per order |
| `purchase_orders` | Supplier orders |
| `contacts` | CRM contacts |
| `contact_notes` | Notes per contact |
| `profiles` | User accounts with roles, commission rates, tiers |
| `protocols` | Protocol templates |
| `protocol_items` | Dosage items within protocols |
| `protocol_logs` | Client intake logging |
| `client_inventory` | Peptides assigned to clients |
| `daily_macros` | Nutrition tracking |
| `macro_goals` | Per-user nutrition targets |
| `body_metrics` | Weight/measurement tracking |
| `water_intake` | Daily water logs |
| `meal_templates` | Saved meals |
| `expenses` | Business expense tracking |
| `commissions` | Commission ledger |
| `client_requests` | Client request system |
| `client_feedback` | Protocol feedback |
| `client_messages` | Messaging system |
| `resources` | Educational content library |
| `resource_themes` | Content organization |
| `community_topics` | Forum topics |
| `community_messages` | Forum messages |
| `audit_logs` | Change tracking |
| `organizations` | Multi-tenant org support |

---

## External Integrations

| Service | Purpose |
|---------|---------|
| **Supabase** | Database, auth, RLS, edge functions, real-time |
| **PsiFi** | Payment processing (checkout sessions, webhooks) |
| **Shippo** | Shipping labels, rates, tracking |
| **WooCommerce REST API** | Order sync from WordPress storefront |
| **OpenAI** | Food image analysis for nutrition tracking |
| **OpenFoodFacts** | Barcode → nutrition data lookup |
| **Vercel** | Hosting + serverless functions |

---

## Serverless API Endpoints (Vercel)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/checkout/create-session` | Create PsiFi payment session |
| `POST /api/shipping/create-label` | Create Shippo shipping label |
| `POST /api/webhooks/psifi` | Handle payment status webhooks |

---

## Automation Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `scripts/woo-sync-orders.ts` | Poll WooCommerce for new/updated orders | Every 15 min (cron) |
| `scripts/ship-orders.ts` | Create shipping labels for fulfilled orders + track deliveries | Every 5 min (cron) |
| `scripts/backfill-profit.ts` | One-time: calculate COGS/profit for historical orders | Manual |

---

## Deployment

- **Frontend**: Vercel (auto-deploys from GitHub push)
- **Database**: Supabase Cloud (us-east-2)
- **Cron jobs**: OpenClaw/Jarvis agent (local Windows machine)
- **WooCommerce**: WordPress at shop.pureuspeptide.com (separate hosting)
- **Git strategy**: push to both `origin/main` (production) and `origin/master` (preview)
