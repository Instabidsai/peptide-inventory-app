# Partner & Commission System — ThePeptideAI

The most fragile subsystem. Understand fully before touching orders, profiles, or pricing.

## Architecture

### Roles
- `sales_rep` = partner/affiliate who earns commissions on sales
- Partners have `upline_id` (FK → profiles) forming a multi-level tree
- Each partner has `commission_rate` (0-100, percentage format)

### Commission Flow
```
Order Created/Updated (any code path)
  → DB Trigger fires automatically
  → Reads: order.total, order.contact_id
  → Finds assigned rep via contact → profile linkage
  → Reads: profiles.commission_rate for that rep
  → Walks upline_id chain (typically 2-3 levels deep)
  → Creates commission records:
      Level 1: direct rep
      Level 2: rep's upline
      Level 3: upline's upline (if exists)
  → Commission status lifecycle:
      pending → available (when order.status = 'paid') → paid (manual payout)
```

### Key Tables
| Table | Role |
|-------|------|
| `profiles` | `role`, `commission_rate`, `upline_id`, `partner_tier` |
| `commissions` | `partner_id`, `order_id`, `amount`, `rate`, `status`, `level` |
| `pricing_tiers` | Customer-facing discount tiers (separate from commission rates) |
| `wholesale_pricing_tiers` | Bulk pricing config |
| `partner_discount_codes` | Coupon codes synced to WooCommerce/Shopify |

## Pages

| File | Purpose |
|------|---------|
| `admin/Reps.tsx` | Manage all sales reps for this org |
| `admin/PartnerDetail.tsx` | Deep view — orders, downline, commissions for one partner |
| `admin/Commissions.tsx` | All commission records — filter by status |
| `admin/components/TierConfigTab.tsx` | Configure wholesale pricing tiers |
| `admin/components/DownlineVisualizer.tsx` | Visual tree of partner network (recursive CTE) |
| `partner/PartnerDashboard.tsx` | Partner's own view — their commissions, stats |
| `partner/PartnerStore.tsx` | Partner ordering with tier pricing |
| `partner/PartnerOrders.tsx` | Partner's order history |

## Discount Code Sync

Partners get unique discount codes synced to external platforms:

```
Admin creates code → partner_discount_codes table
  → sync-discount-codes edge function
  → WooCommerce: creates coupon via REST API
  → Shopify: creates priceRule → discount code (two-step)
  → platform_coupon_id stores: "woo:123,shopify:456"
```

When a customer uses a discount code on WooCommerce/Shopify:
- Webhook fires → order created in our system
- Code matched to partner via `partner_discount_codes`
- Commission attributed to that partner

## Fragile Areas

1. **Changing order_items after creation** — may cause commission recalculation via trigger
2. **Deleting a rep's profile** — commissions are NOT cascade-deleted. Handle manually.
3. **DownlineVisualizer** — recursive CTE works fine to ~100 nodes, slows past that
4. **Commission rate changes** — only affect NEW orders. Existing commissions keep their original rate.
5. **pricing_tiers vs commission_rate** — these are completely separate systems. Tiers = customer discounts, commission_rate = partner payouts.
6. **partner_discount_codes.partner_id vs profiles.id FK** — `partner_discount_codes.partner_id` stores `profiles.user_id` (auth UUID), but `sales_orders.rep_id` FK references `profiles.id` (profile UUID). These are DIFFERENT values. When attributing an order via coupon code, you MUST resolve `user_id → profiles.id` before setting `rep_id`. Fixed in `platform-order-sync.ts` and `woo-webhook/index.v22-zero-import.ts`.

## Partner AI Chat

`partner-ai-chat` edge function — scoped to partner's org and their downline data only. Uses `sales_rep` role check.
