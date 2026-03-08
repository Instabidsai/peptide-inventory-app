# ThePeptideAI — Runbook (Symptom → Cause → Fix)

## Dependency Map — What Breaks What

```
organizations
  └── profiles (org_id FK) — DON'T delete org without cascading
  └── tenant_config (org_id PK) — one row per org, always UPDATE not INSERT
  └── org_features (org_id FK) — 19 features seeded at signup

peptides
  └── lots (peptide_id FK) — can't delete peptide with lots
  └── scraped_peptides (imported_peptide_id FK)
  └── pricing_tiers — pricing from tiers, not stored on peptide

lots
  └── bottles (lot_id FK) — inventory counts come from bottles, not lots

contacts
  └── orders (contact_id FK) — can't create order without contact
  └── commissions (partner_id FK via profiles)
  └── households (household_id FK)

orders
  └── commissions (TRIGGER on insert/update) — status change fires commission calc
  └── bottles (status updated on fulfillment)
  └── order_items (cascade delete safe)

profiles
  └── commissions (partner_id FK) — sales_rep role only
  └── upline_id self-reference — multi-level commission tree
```

## High-Risk Operations

| Operation | Risk | Mitigation |
|-----------|------|------------|
| Change `orders.status` | Fires commission trigger | Test with non-production order first |
| Modify RLS policies | Cross-org data leak | Always include `org_id = auth.jwt()->>'org_id'` |
| Delete from `tenant_config` | Breaks entire tenant | NEVER delete — only UPDATE |
| Edit `_shared/auth.ts` | Affects all 35+ edge functions | Test with health-probe after deploy |
| Change `org_features` seeding | Affects all new signups | Update provision-tenant edge function |
| Delete a sales_rep profile | Orphans their commissions | Handle commission records first |
| Modify `order_items` after creation | May cause commission recalc | Check trigger behavior |

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Row not found" on tenant_config | Tried INSERT instead of UPDATE | Use UPDATE — row created at provisioning |
| Commission not created | Order has no contact with assigned rep | Ensure contact_id links to profile with sales_rep role |
| Delete contact fails with FK error | `payment_email_queue.ai_suggested_contact_id` has NO ACTION FK | Fixed in `delete_contact_cascade` RPC — now nullifies before delete |
| Cross-org data visible | Missing org_id filter in query | Add `.eq('org_id', orgId)` to every query |
| Edge function 401 | verify_jwt = true in config.toml | Set to `false`, use `_shared/auth.ts` |
| Edge function write blocked | Missing set_config in same SQL call | Prepend `SELECT set_config('app.agent_org_id', orgId, true)` |
| Feature toggle breaks UI | Dependent feature still expects it | Check feature dependency chain (see specs/admin-portal.md) |
| DownlineVisualizer slow | >100 nodes in recursive CTE | Add depth limit to CTE query |
| Commission double-counted | Order status changed multiple times | Check trigger idempotency — should upsert, not insert |
| Build fails on Vercel | Import from wrong supabase path | Use `@/integrations/sb_client/client` |
| Self-healing not processing | Sentinel-worker cron stopped | Check pg_cron: `SELECT * FROM cron.job WHERE jobname LIKE 'sentinel%'` |

## Debugging Commands

```bash
# Check edge function logs
supabase functions logs sentinel-worker --tail
supabase functions logs health-probe --tail

# Check self-healing status
# Via Supabase SQL:
SELECT * FROM sentinel_runs ORDER BY created_at DESC LIMIT 5;
SELECT * FROM bug_reports WHERE sentinel_processed_at IS NULL;
SELECT * FROM incidents WHERE status NOT IN ('resolved', 'healed') ORDER BY created_at DESC;

# Check commission state
SELECT c.*, p.first_name, p.last_name
FROM commissions c JOIN profiles p ON c.partner_id = p.id
WHERE c.org_id = '<ORG_ID>' ORDER BY c.created_at DESC;

# Check feature flags for an org
SELECT * FROM org_features WHERE org_id = '<ORG_ID>' ORDER BY feature_key;

# Deploy single edge function
supabase functions deploy <function-name>

# Run full build check
bun run build
bun run test
```

---

## Symptom → Cause → Fix

| Symptom | Cause | Fix |
|---------|-------|-----|
| Partner shows "page doesn't exist" when clicked from DownlineVisualizer | `DownlineVisualizer.tsx` navigated to `/admin/contacts/:id` which doesn't exist; correct route is `/contacts/:id` | Changed `navigate(\`/admin/contacts/${contactId}\`)` → `navigate(\`/contacts/${contactId}\`)` in DownlineVisualizer.tsx:75 |
| Referral link `/r/:slug` or `/r/:slug?p` goes to 404 | No route existed in the HashRouter for `/r/:slug`. Short referral URLs were completely broken. | Created `ReferralRedirect.tsx` page + added `<Route path="/r/:slug">` in App.tsx. Resolves slug via `resolve_referral_slug` RPC, converts `?p` → `?role=partner&tier=standard`, redirects to `/join`. |
| Partner created via referral link shows as customer, invisible in partner views | Without `/r/:slug` route, the `?p` flag was never parsed, so `link_referral` RPC received `role='customer'` instead of `role='partner'`. Result: `profiles.role='client'`, `contacts.type='customer'`. Partner hooks filter by `role='sales_rep'`. | Fix the route (above) + manually fix data: `profiles.role → sales_rep`, `user_roles.role → sales_rep`, `contacts.type → partner`. |
| Partner invisible in hierarchy (neither top-level nor child) | `parent_rep_id` was self-referencing (pointed to own profile ID). Hierarchy logic: top-level = no parent or parent not in dataset. Self-ref means parent IS in dataset, but the node itself IS the parent — infinite loop, filtered out. | Added self-reference guard in `link_referral` RPC: `CASE WHEN v_referrer_id = v_new_profile_id THEN NULL ELSE v_referrer_id END`. Migration: `20260307120000_fix_link_referral_self_ref_guard.sql`. |
| Partner (sales_rep) sees ALL orders in the system | Two issues: (1) `/sales`, `/orders` admin routes had no role guard — sales_rep could access admin order pages showing all org orders. (2) RLS SELECT on `sales_orders` only checks `org_id`, no role filtering. (3) `PartnerOrders.tsx` query missing `.eq('org_id', ...)`. | (1) Added `RoleBasedRedirect allowedRoles={['admin','staff','super_admin']}` to `/orders`, `/sales`, `/sales/new`, `/sales/:id` routes. (2) Added rep_id filter in `useSalesOrders` for sales_rep role. (3) Added `.eq('org_id', ...)` to PartnerOrders.tsx. (4) Added org_id to `useSalesOrder` single-order hook. |
