-- ═══════════════════════════════════════════════════════════════
-- Migration: External Referral Network
-- Adds external_store_url + external_store_platform to tenant_config
-- Enables partner referral links to redirect to real store websites
-- ═══════════════════════════════════════════════════════════════

-- 1. Add external store config to tenant_config
ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS external_store_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS external_store_platform TEXT DEFAULT 'woocommerce'
    CHECK (external_store_platform IN ('woocommerce', 'shopify'));
