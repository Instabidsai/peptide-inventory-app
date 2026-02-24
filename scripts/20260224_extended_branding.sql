-- ================================================================
-- Extended Branding: per-tenant visual customization + website scraping
-- Date: 2026-02-24
-- Run via Supabase SQL editor
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Extend tenant_config with full branding columns
-- ────────────────────────────────────────────────────────────────

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    secondary_color TEXT;

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    font_family TEXT;

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    favicon_url TEXT;

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    custom_css TEXT;

-- The URL they submitted during onboarding (if "I have a website")
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    website_url TEXT;

-- Raw JSON from the scraper (brand + products) — kept for re-processing
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS
    scraped_brand_data JSONB DEFAULT '{}';

-- ────────────────────────────────────────────────────────────────
-- 2. Scraped peptide staging table
--    Holds peptides extracted from a website before tenant confirms import.
--    Status: pending → accepted → rejected
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraped_peptides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC,
    description TEXT,
    image_url TEXT,
    source_url TEXT,
    confidence NUMERIC DEFAULT 0,         -- 0-1 confidence score from LLM
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    imported_peptide_id UUID REFERENCES peptides(id), -- link after import
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE scraped_peptides ENABLE ROW LEVEL SECURITY;

-- Tenant members can see their own scraped peptides
CREATE POLICY "scraped_peptides_tenant_read" ON scraped_peptides
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

-- Admins can update status (accept/reject)
CREATE POLICY "scraped_peptides_tenant_write" ON scraped_peptides
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Service role can insert (edge function uses service key)
-- (Covered by RLS bypass with service_role key)

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_scraped_peptides_org_status
    ON scraped_peptides (org_id, status);

-- ────────────────────────────────────────────────────────────────
-- 3. org_features table (feature flags per tenant)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, feature_key)
);

ALTER TABLE org_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_features_tenant_read" ON org_features
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "org_features_admin_write" ON org_features
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Seed default features for new tenants (can be called by self-signup)
CREATE OR REPLACE FUNCTION seed_default_features(p_org_id UUID)
RETURNS void AS $$
    INSERT INTO org_features (org_id, feature_key, enabled) VALUES
        (p_org_id, 'ai_chat', true),
        (p_org_id, 'ai_builder', true),
        (p_org_id, 'client_store', true),
        (p_org_id, 'fulfillment', true),
        (p_org_id, 'partner_network', false),
        (p_org_id, 'commissions', false),
        (p_org_id, 'white_label', false),
        (p_org_id, 'custom_domain', false)
    ON CONFLICT (org_id, feature_key) DO NOTHING;
$$ LANGUAGE sql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- 4. Verification
-- ────────────────────────────────────────────────────────────────
SELECT 'tenant_config: secondary_color' AS check_item,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_config' AND column_name = 'secondary_color'
    ) THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'tenant_config: font_family',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_config' AND column_name = 'font_family'
    ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'tenant_config: favicon_url',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_config' AND column_name = 'favicon_url'
    ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'tenant_config: website_url',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_config' AND column_name = 'website_url'
    ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'scraped_peptides table',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'scraped_peptides'
    ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'org_features table',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'org_features'
    ) THEN 'OK' ELSE 'MISSING' END;
