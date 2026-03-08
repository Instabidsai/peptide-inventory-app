-- Add crypto_wallets JSONB column to tenant_config
-- Stores array of wallet configs: [{type, chain, address, label, enabled}]
-- Each org can configure multiple crypto wallets for checkout

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    crypto_wallets JSONB NOT NULL DEFAULT '[]'::jsonb;

-- No RLS changes needed — existing tenant_config policies
-- (tenant_config_read, tenant_config_admin_write, tenant_config_service)
-- automatically cover the new column.
