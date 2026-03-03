-- Add pricing mode toggle to tenant_config.
-- 'tier' = volume-based markup tiers (default, existing behavior)
-- 'custom' = flat per-item prices from tenant_wholesale_prices table
ALTER TABLE tenant_config
ADD COLUMN IF NOT EXISTS wholesale_pricing_mode TEXT NOT NULL DEFAULT 'tier'
CHECK (wholesale_pricing_mode IN ('tier', 'custom'));

COMMENT ON COLUMN tenant_config.wholesale_pricing_mode IS 'tier = volume-based markup tiers, custom = flat per-item prices from tenant_wholesale_prices';
