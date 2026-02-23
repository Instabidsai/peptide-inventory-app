-- ================================================================
-- Business-in-a-Box: Wholesale Pricing, Supplier Catalog, Subdomains
-- Date: 2026-02-23
-- Run via Supabase SQL editor
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Wholesale Pricing Tiers (global — not per-org)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wholesale_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    min_monthly_units INT NOT NULL DEFAULT 0,
    discount_pct NUMERIC NOT NULL,          -- 0.40 = 40% off MSRP
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE wholesale_pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Everyone can read tiers (needed for onboarding + pricing display)
CREATE POLICY "wholesale_tiers_public_read" ON wholesale_pricing_tiers
    FOR SELECT USING (true);

-- Only super_admin can modify tiers
CREATE POLICY "wholesale_tiers_super_admin_write" ON wholesale_pricing_tiers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

-- Seed default tiers
INSERT INTO wholesale_pricing_tiers (name, min_monthly_units, discount_pct, sort_order) VALUES
    ('Starter',  0,    0.40, 1),   -- 40% off MSRP → buy at 60%
    ('Growth',   50,   0.50, 2),   -- 50% off MSRP → buy at 50%
    ('Scale',    200,  0.55, 3),   -- 55% off MSRP → buy at 45%
    ('Volume',   500,  0.60, 4)    -- 60% off MSRP → buy at 40%
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 2. Extend tenant_config with supplier/wholesale/subdomain
-- ────────────────────────────────────────────────────────────────
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    wholesale_tier_id UUID REFERENCES wholesale_pricing_tiers(id);

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    supplier_org_id UUID REFERENCES organizations(id);

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    subdomain TEXT;

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    onboarding_path TEXT DEFAULT 'new';

-- Unique index on subdomain (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_config_subdomain
    ON tenant_config (subdomain)
    WHERE subdomain IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 3. Extend sales_orders with supplier/dropship fields
-- ────────────────────────────────────────────────────────────────
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS
    is_supplier_order BOOLEAN DEFAULT false;

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS
    source_org_id UUID REFERENCES organizations(id);

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS
    fulfillment_type TEXT DEFAULT 'standard';

-- Index for supplier order queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_supplier
    ON sales_orders (is_supplier_order)
    WHERE is_supplier_order = true;

CREATE INDEX IF NOT EXISTS idx_sales_orders_source_org
    ON sales_orders (source_org_id)
    WHERE source_org_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 4. Update subscription plan pricing
-- ────────────────────────────────────────────────────────────────
UPDATE subscription_plans SET
    display_name = 'Starter',
    price_monthly = 34900,
    price_yearly = 349900,
    features = '["Full inventory management", "AI chat assistant", "Client portal", "Supplier catalog", "5 team members", "Email support"]'::JSONB
WHERE name = 'starter';

UPDATE subscription_plans SET
    display_name = 'Professional',
    price_monthly = 49900,
    price_yearly = 499900,
    features = '["Everything in Starter", "Advanced fulfillment", "Partner network", "Automations", "25 team members", "Priority support", "Data export"]'::JSONB
WHERE name = 'professional';

UPDATE subscription_plans SET
    display_name = 'Enterprise',
    price_monthly = 129900,
    price_yearly = 1299000,
    features = '["Everything in Professional", "Jarvis AI ecosystem", "Autonomous operations", "Unlimited users", "White-label domain", "Dedicated support", "SLA guarantee", "Custom integrations"]'::JSONB
WHERE name = 'enterprise';

-- ────────────────────────────────────────────────────────────────
-- 5. RLS: supplier orders cross-tenant visibility
-- ────────────────────────────────────────────────────────────────

-- Super-admin (vendor) can read all supplier orders across tenants
-- This is a permissive policy that adds to existing sales_orders policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'sales_orders' AND policyname = 'supplier_orders_vendor_read'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "supplier_orders_vendor_read" ON sales_orders
                FOR SELECT USING (
                    is_supplier_order = true
                    AND EXISTS (
                        SELECT 1 FROM user_roles
                        WHERE user_id = auth.uid() AND role = 'super_admin'
                    )
                )
        $policy$;
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 6. RPC: get_supplier_orders (for vendor dashboard)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_supplier_orders(p_supplier_org_id UUID)
RETURNS TABLE (
    order_id UUID,
    merchant_org_id UUID,
    merchant_name TEXT,
    order_date TIMESTAMPTZ,
    status TEXT,
    payment_status TEXT,
    total_amount NUMERIC,
    item_count BIGINT
) AS $$
    SELECT
        so.id,
        so.org_id,
        o.name,
        so.created_at,
        so.status,
        so.payment_status,
        so.total_amount,
        count(soi.id)
    FROM sales_orders so
    JOIN organizations o ON o.id = so.org_id
    LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
    WHERE so.is_supplier_order = true
      AND EXISTS (
          SELECT 1 FROM tenant_config tc
          WHERE tc.org_id = so.org_id
          AND tc.supplier_org_id = p_supplier_org_id
      )
    GROUP BY so.id, so.org_id, o.name, so.created_at, so.status, so.payment_status, so.total_amount
    ORDER BY so.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- 7. RPC: check_subdomain_availability
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_subdomain_availability(p_subdomain TEXT)
RETURNS BOOLEAN AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM tenant_config WHERE subdomain = lower(trim(p_subdomain))
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- 8. Verification query
-- ────────────────────────────────────────────────────────────────
SELECT 'wholesale_pricing_tiers' AS item, count(*)::text AS result FROM wholesale_pricing_tiers
UNION ALL
SELECT 'tenant_config has subdomain col',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_config' AND column_name = 'subdomain'
    ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'sales_orders has is_supplier_order',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sales_orders' AND column_name = 'is_supplier_order'
    ) THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'starter plan price', price_monthly::text FROM subscription_plans WHERE name = 'starter'
UNION ALL
SELECT 'professional plan price', price_monthly::text FROM subscription_plans WHERE name = 'professional'
UNION ALL
SELECT 'enterprise plan price', price_monthly::text FROM subscription_plans WHERE name = 'enterprise';
