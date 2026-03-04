# Admin Portal — ThePeptideAI

Admin is the merchant's own back-office. Each merchant's admin users only see their own org's data. Admin ≠ Vendor (vendor = super-admin managing ALL tenants).

## Pages

| File | Purpose | Key Tables |
|------|---------|------------|
| `AdminDashboard.tsx` | Overview — recent orders, stats, alerts | `orders`, `bottles`, `contacts` |
| `Finance.tsx` | P&L, per-order profitability | `orders`, `lots`, `commissions` |
| `Commissions.tsx` | Commission records — pending, available, paid | `commissions`, `profiles` |
| `Reps.tsx` | Sales rep management | `profiles` (role=sales_rep) |
| `PartnerDetail.tsx` | Deep view of one partner — orders, downline, commissions | `profiles`, `commissions`, `contacts` |
| `Automations.tsx` | Rule-based automation engine | `automation_modules`, edge: `run-automations` |
| `FeatureManagement.tsx` | Toggle features on/off | `org_features` |
| `AdminSupplements.tsx` | Supplement catalog | `supplements` |
| `AdminRequests.tsx` | Client requests & support tickets | `client_requests` |
| `SystemHealth.tsx` | Edge function health, integration status | — |
| `AdminResources.tsx` | Content management | `resources` |
| `FeedbackHub.tsx` | Client requests + partner suggestions + auto-heal | `bug_reports` |

## Commission System

**This is the most complex and fragile subsystem.**

### Flow
```
Order Created/Updated
  → DB Trigger fires
  → Reads: order.total, order.contact_id → finds assigned rep
  → Reads: profiles.commission_rate for that rep
  → Walks upline chain via profiles.upline_id (multi-level)
  → Creates commission records for rep + each upline level
  → Status: pending → available (order paid) → paid
```

### Rules
- Commissions created by DB trigger — never manually unless debugging
- `order.status` → `paid` marks commissions as `available`
- `profiles.commission_rate` is 0-100 (percentage), not decimal
- Downline depth typically 2-3 levels via `upline_id` chain
- `pricing_tiers` = customer discounts; `commission_rate` = rep payouts — separate systems

### Fragile Areas
- Changing `order_items` after creation may cause commission recalculation
- Deleting a rep's profile doesn't cascade-delete their commissions
- `DownlineVisualizer` uses recursive CTE — fine up to ~100 nodes, slows past that

## Finance Page

```
Net Profit = order.total - COGS - shipping_cost - commission_total
COGS = SUM(bottles.cost_per_unit) for order's bottles
       (fallback: lot.cost_per_unit if bottle-level cost unavailable)
```
Uses Supabase RPC functions for aggregation. Modifying cost tracking → check RPC definitions in migrations.

## Automations Engine

`Automations.tsx` + edge function `run-automations`. Rules stored in `automation_modules` as JSON. Engine evaluates conditions → fires actions (send email, update record, create task).

**Rule**: Don't add automation action types in UI without also adding the handler in `run-automations` edge function. They must stay in sync.

## Feature Flags (org_features)

Dependencies between features:
```
order_management ON → FulfillmentCenter available
fulfillment ON → shipping_labels needed for label printing
client_store ON → ClientStore visible to clients
partner_dashboard ON → partner portal accessible to reps
analytics ON → Finance page shows full data
```
Use `useOrgFeatures()` hook before rendering feature-gated components.
