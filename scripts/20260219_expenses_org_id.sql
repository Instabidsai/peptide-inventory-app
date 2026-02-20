-- Add org_id to expenses table for multi-tenant isolation
-- Run via Supabase SQL editor

-- 1. Add the column (nullable first for backfill)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- 2. Backfill existing expenses: infer org from related_sales_order_id or related_order_id
UPDATE expenses e
SET org_id = so.org_id
FROM sales_orders so
WHERE e.related_sales_order_id = so.id
  AND e.org_id IS NULL;

UPDATE expenses e
SET org_id = o.org_id
FROM orders o
WHERE e.related_order_id = o.id
  AND e.org_id IS NULL;

-- 3. For any remaining expenses without a relation, assign to the first org
-- (single-tenant backfill — adjust if multiple orgs exist)
UPDATE expenses
SET org_id = (SELECT id FROM organizations LIMIT 1)
WHERE org_id IS NULL;

-- 4. Make org_id NOT NULL after backfill
ALTER TABLE expenses ALTER COLUMN org_id SET NOT NULL;

-- 5. Add index for org_id filtering
CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON expenses(org_id);

-- 6. RLS policies
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org expenses"
  ON expenses FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own org expenses"
  ON expenses FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own org expenses"
  ON expenses FOR UPDATE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own org expenses"
  ON expenses FOR DELETE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Super-admin access to all expenses
CREATE POLICY "Super admin read all expenses"
  ON expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super admin manage all expenses"
  ON expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
