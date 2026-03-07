# Migrations — PeptideAI

153 migrations total. Supabase format. Applied in lexicographic filename order.

## Naming Convention

```
YYYYMMDD[HHMMSS]_description.sql
```

- Date prefix is mandatory. Time suffix is optional but used when ordering matters on the same day.
- Early auto-generated files used UUID slugs (e.g. `20260117180628_a983ba93-...sql`). All hand-written migrations use readable snake_case descriptions.
- One outlier with no date prefix: `match_documents.sql` (pgvector helper, applied manually).

## Migration Categories

| Category | Pattern | Examples |
|----------|---------|---------|
| Schema changes | `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | `_add_payment_pool`, `_tenant_wholesale_prices` |
| RLS policies | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` | `_fix_payment_pool_rls`, `_fix_messaging_rls_org_isolation` |
| Triggers | `CREATE OR REPLACE FUNCTION trg_*`, `CREATE TRIGGER` | `_referral_slugs`, `_add_claim_token` |
| RPC functions | `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` | `_recalculate_commission_rpc`, `_update_sales_order_rpc` |
| Data seeding / backfill | `UPDATE ... WHERE ... IS NULL`, `INSERT INTO ... ON CONFLICT DO NOTHING` | `_sync_peptides_to_themes` |
| Fixes | `fix_` prefix — drop/recreate broken policies or functions | `_fix_fulfillment_rls`, `_fix_all_rpc_impersonation` |

## Writing New Migrations

1. **Idempotency**: Always use `IF NOT EXISTS` / `IF EXISTS`. Use `CREATE OR REPLACE` for functions and triggers. Use `DROP POLICY IF EXISTS` before recreating.
2. **Org scoping**: Every table MUST have `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`.
3. **RLS**: `ALTER TABLE x ENABLE ROW LEVEL SECURITY` in the same migration that creates the table. Add at minimum a read policy and a service_role bypass policy.
4. **Timestamps**: Always include `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
5. **RLS pattern for org isolation**:
   ```sql
   USING (org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid()))
   ```
6. **Service role bypass** (for edge functions):
   ```sql
   CREATE POLICY "x_service" ON x FOR ALL USING (auth.role() = 'service_role');
   ```
7. **Test before applying**: Check for NULL `org_id`, duplicate unique keys, and that backfill `WHERE` clauses are scoped correctly.
8. **SECURITY DEFINER RPCs**: Always add `SET search_path = public` to prevent search path injection.

## Recent Migration Timeline (last 15)

| File | What it does |
|------|-------------|
| `20260303_tenant_wholesale_prices.sql` | New table for flat per-item wholesale prices per org |
| `20260303_wholesale_pricing_mode.sql` | Feature flag to switch between tier-based and flat pricing |
| `20260303_referral_slugs.sql` | `referral_slug` on profiles, generator fn, trigger, backfill, resolver RPC |
| `20260303_link_referral_tier_param.sql` | Link referral to tier config param |
| `20260303_link_referral_read_tier_config.sql` | RLS read access for referral tier config |
| `20260303_fix_promote_impersonation.sql` | Fix set_config impersonation in promote RPC |
| `20260303_fix_promote_fk_constraint.sql` | Fix FK violation during partner promote |
| `20260303_fix_messaging_rls_org_isolation.sql` | Enforce org_id on messaging tables |
| `20260303_fix_fulfillment_rls` (via `20260304`) | `has_any_role()` fallback; sales_rep can fulfill own orders |
| `20260304_extend_lead_submissions.sql` | Extra fields on lead_submissions table |
| `20260304_super_admin_update_sales_orders.sql` | Vendor (super-admin) policy to update any org's orders |
| `20260304_update_sales_order_rpc.sql` | RPC for updating sales order status/fields |
| `20260306000000_add_payment_pool.sql` | Payment Pool tables: `payment_pools`, `pool_transactions` |
| `20260306100000_fix_payment_pool_rls.sql` | Replace set_config policies with JWT-based org isolation policies |
| `match_documents.sql` | pgvector similarity search helper (no date prefix, manual apply) |
