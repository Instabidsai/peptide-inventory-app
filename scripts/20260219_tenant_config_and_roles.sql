-- ================================================================
-- AUDIT FIX: Tenant config table + role enum expansion
-- Date: 2026-02-19
-- Fixes: #5 (tenant_config), #7 (enum mismatch), #24 (session timeout)
-- ================================================================

-- 1. Create tenant_config table for multi-tenant white-labeling
CREATE TABLE IF NOT EXISTS tenant_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL DEFAULT 'Peptide AI',
    admin_brand_name TEXT NOT NULL DEFAULT 'Peptide Admin',
    support_email TEXT DEFAULT '',
    app_url TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    primary_color TEXT DEFAULT '#7c3aed',
    ship_from_name TEXT DEFAULT '',
    ship_from_street TEXT DEFAULT '',
    ship_from_city TEXT DEFAULT '',
    ship_from_state TEXT DEFAULT '',
    ship_from_zip TEXT DEFAULT '',
    ship_from_country TEXT DEFAULT 'US',
    ship_from_phone TEXT DEFAULT '',
    ship_from_email TEXT DEFAULT '',
    zelle_email TEXT DEFAULT '',
    ai_system_prompt_override TEXT DEFAULT NULL,
    session_timeout_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id)
);

-- Enable RLS
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read their org's config (needed for branding)
CREATE POLICY "tenant_config_read" ON tenant_config
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

-- Only admin can write
CREATE POLICY "tenant_config_admin_write" ON tenant_config
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Service role bypass
CREATE POLICY "tenant_config_service" ON tenant_config
    FOR ALL USING (auth.role() = 'service_role');

-- 2. Expand app_role enum with missing roles
-- Check if enum exists and add missing values
DO $$
BEGIN
    -- Add 'fulfillment' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'fulfillment' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'fulfillment';
    END IF;

    -- Add 'customer' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'customer';
    END IF;

    -- Add 'sales_rep' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sales_rep' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'sales_rep';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add enum values (may already exist): %', SQLERRM;
END $$;

-- 3. Seed initial config for existing org
INSERT INTO tenant_config (org_id, brand_name, admin_brand_name, app_url, ship_from_name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip, ship_from_phone, ship_from_email, zelle_email, support_email)
SELECT
    id,
    'PeptideHealth',
    'NextGen Research Labs',
    'https://app.thepeptideai.com',
    'NextGen Research Labs',
    '2432 SW 12th St',
    'Deerfield Beach',
    'FL',
    '33442',
    '5551234567',
    'shipping@nextgenresearchlabs.com',
    'admin@nextgenresearchlabs.com',
    'support@thepeptideai.com'
FROM organizations
WHERE NOT EXISTS (SELECT 1 FROM tenant_config WHERE tenant_config.org_id = organizations.id)
LIMIT 1;

-- 4. Add updated_at trigger for tenant_config
CREATE OR REPLACE FUNCTION update_tenant_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_config_updated
    BEFORE UPDATE ON tenant_config
    FOR EACH ROW EXECUTE FUNCTION update_tenant_config_timestamp();
