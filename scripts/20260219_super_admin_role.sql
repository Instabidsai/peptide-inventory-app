-- Add super_admin role for vendor-level access
-- This role can provision tenants, view all orgs, manage the platform

-- 1. Add super_admin to app_role enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add super_admin enum: %', SQLERRM;
END $$;

-- 2. Add unique constraint on user_roles for upsert support
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_org_unique'
    ) THEN
        ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_org_unique UNIQUE (user_id, org_id);
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Constraint may already exist: %', SQLERRM;
END $$;

-- 3. Create pricing_tiers table if not exists (needed by provision-tenant)
CREATE TABLE IF NOT EXISTS pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    markup_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "pricing_tiers_read" ON pricing_tiers
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY IF NOT EXISTS "pricing_tiers_admin_write" ON pricing_tiers
    FOR ALL USING (
        org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- 4. Super-admin RLS bypass policies for key tables
-- Super admins can read ALL organizations and tenant configs
CREATE POLICY IF NOT EXISTS "super_admin_read_all_orgs" ON organizations
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

CREATE POLICY IF NOT EXISTS "super_admin_read_all_configs" ON tenant_config
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

CREATE POLICY IF NOT EXISTS "super_admin_manage_configs" ON tenant_config
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );
