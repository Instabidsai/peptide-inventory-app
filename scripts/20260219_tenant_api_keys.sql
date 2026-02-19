-- Per-tenant API key storage
-- Stores encrypted keys for Stripe, Shippo, OpenAI, etc.
-- Run via Supabase SQL editor

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service TEXT NOT NULL,           -- e.g. 'stripe_secret_key', 'shippo_api_key'
    api_key TEXT NOT NULL,           -- actual key (consider pgcrypto encryption in production)
    api_key_masked TEXT NOT NULL,    -- e.g. 'sk_live_...abcd' for display
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, service)
);

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins of the org can read/write their own keys
CREATE POLICY "tenant_api_keys_admin_read" ON tenant_api_keys
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "tenant_api_keys_admin_write" ON tenant_api_keys
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Super-admins can read all keys (for debugging/support)
CREATE POLICY "tenant_api_keys_super_admin" ON tenant_api_keys
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tenant_api_keys_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_api_keys_updated_at
    BEFORE UPDATE ON tenant_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_api_keys_timestamp();

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_org_service ON tenant_api_keys(org_id, service);
