# Admin Portal — ThePeptideAI
_Agents: update this file when you discover gotchas or change admin behavior._

## What the Admin Portal Is
Admin is the **merchant's own back-office** — inventory, orders, finance, partners, automations. Each merchant's admin users only see their own org's data (enforced by RLS + org_id scoping).

Admin ≠ Vendor. Admin = merchant's own staff managing their business. Vendor = PureUSPeptide managing all merchants.

---

## Pages Reference

| File | Purpose | Key Tables |
|------|---------|------------|
| `AdminDashboard.tsx` | Main admin overview — recent orders, stats, alerts | `orders`, `bottles`, `contacts` |
| `Finance.tsx` | P&L, per-order profitability (Revenue - COGS - Shipping - Commission) | `orders`, `lots`, `commissions` |
| `Commissions.tsx` | Commission records — pending, available, paid | `commissions`, `profiles` |
| `Reps.tsx` | Sales rep management — add, edit, view stats | `profiles` (role=sales_rep) |
| `PartnerDetail.tsx` | Deep view of one partner — orders, downline, commissions | `profiles`, `commissions`, `contacts` |
| `Automations.tsx` | Rule-based automation engine | `automations`, edge: `run-automations` |
| `FeatureManagement.tsx` | Toggle features on/off for this org | `org_features` |
| `AdminSupplements.tsx` | Manage supplement/add-on catalog | `supplements` |
| `AdminRequests.tsx` | Client requests & support tickets | `requests` |
| `SystemHealth.tsx` | Edge function health, integration status | — |
| `components/TierConfigTab.tsx` | Configure wholesale pricing tiers | `wholesale_pricing_tiers` |
| `components/DownlineVisualizer.tsx` | Visual tree of partner network | `profiles` (upline_id) |

---

## Commission System — How It Works
This is the most complex and fragile subsystem. Understand it before touching orders or profiles.

```
Order Created/Updated
        ↓
   DB Trigger fires
        ↓
   Reads: order.total, order.contact_id → finds assigned rep (profiles.sales_rep)
        ↓
   Reads: profiles.commission_rate for that rep
        ↓
   Reads: upline chain via profiles.upline_id (multi-level)
        ↓
   Creates commission records for rep + each upline level
        ↓
   Commission status: pending → available (after order is paid) → paid
```

**Rules:**
- Commissions are created by DB trigger — don't create them manually unless debugging
- Changing `order.status` to `paid` automatically marks commissions as `available`
- `profiles.commission_rate` is a percentage (0-100), not decimal
- Downline depth is typically 2-3 levels — the trigger walks up `upline_id` chain
- `pricing_tiers` controls customer-facing discounts; `commission_rate` controls rep payouts — these are separate systems

### Fragile Areas in Commission Flow
- Changing `order_items` after an order is created may cause commission recalculation — test carefully
- Deleting a rep's profile doesn't cascade-delete their commissions — handle manually
- The `DownlineVisualizer` uses a recursive CTE — works fine up to ~100 nodes, may slow past that

---

## Finance Page — Profitability Calculation
`Finance.tsx` calculates per-order profit using:
```
Net Profit = order.total - COGS - shipping_cost - commission_total
COGS = SUM(bottles.cost_per_unit) for bottles in this order
       (falls back to lot.cost_per_unit if bottle-level cost unavailable)
```

The finance page uses Supabase RPC functions (not direct queries) to handle the aggregation. If you're modifying cost tracking, check the RPC function definitions in migrations.

---

## Automations Engine
`Automations.tsx` + edge function `run-automations`. Rules are stored in `automations` table as JSON. The engine evaluates conditions and fires actions (send email, update record, create task, etc.).

**Don't add new automation action types in the UI without also adding the handler in `run-automations` edge function.** The two must stay in sync.

---

## Feature Flags (org_features)
`FeatureManagement.tsx` lets admins enable/disable features for their org. Some features have UI dependencies:

```
order_management ON → FulfillmentCenter available
fulfillment ON → shipping_labels needed for label printing
client_store ON → ClientStore visible to clients
partner_dashboard ON → partner portal accessible to reps
analytics ON → Finance page shows full data (otherwise limited)
```

If a feature is disabled, its UI should hide gracefully — check `useOrgFeatures()` hook before rendering feature-gated components.

### SaaS-Safe Mode (Master Switch)
`saas_mode` is a master flag that controls 5 child flags at once for B2B SaaS tenants. Defined in `SAAS_MODE_OVERRIDES` (`src/lib/feature-registry.ts`).

**When ON**: `health_tracking=OFF`, `dose_tracking=OFF`, `client_health_ai=OFF`, `protocols=OFF`, `ruo_disclaimer=ON`

**UI behavior in FeatureManagement.tsx**:
- `saas_mode` renders as a prominent card above the category sections
- Child flags show amber "SaaS Mode" lock badge and their switches are disabled
- Toggling `saas_mode` cascades to all child flags in one DB upsert (via `toggleFeature` in `use-org-features.ts`)
- Vendor portal `TenantFeatureToggles.tsx` has the same cascade behavior

**FeatureGate component** (`src/components/FeatureGate.tsx`): Route-level guard that redirects to `/dashboard` when a flag is OFF. Used on client portal routes (`/health`, `/macro-tracker`, `/body-composition`, `/my-regimen`).

**Client portal gating**:
- `ClientMenu.tsx`: Menu items filtered by `featureFlag` property
- `ClientDashboard.tsx`: Dose widgets, compliance, stats gated by `dose_tracking`; regimen link gated by `protocols`
- Store components (`ProductGrid`, `ProductDetailSheet`, `CartSummary`): Show RUO disclaimer when `ruo_disclaimer` is ON
- `chat-with-ai` edge function: Swaps system prompt + removes health tools when `client_health_ai` is OFF

---

## Agent Notes
_Add gotchas here as you work in the admin portal._
<!-- agents: append findings below with date -->
<!-- 2026-03-11: SaaS-Safe Mode added — master flag saas_mode controls 5 child flags. See SAAS_MODE_OVERRIDES in feature-registry.ts -->
