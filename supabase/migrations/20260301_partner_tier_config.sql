-- partner_tier_config: Per-org editable tier definitions
-- Replaces hardcoded TIER_INFO / TIER_DEFAULTS in 3+ frontend files.
-- Each tenant can customize tiers independently.

CREATE TABLE IF NOT EXISTS partner_tier_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier_key text NOT NULL,              -- e.g. 'senior', 'standard', 'referral'
    label text NOT NULL,                 -- display name, e.g. 'Senior Partner'
    emoji text NOT NULL DEFAULT '🔗',
    commission_rate numeric(5,4) NOT NULL DEFAULT 0.10,   -- decimal, e.g. 0.10 = 10%
    price_multiplier numeric(6,2) NOT NULL DEFAULT 2.0,   -- cost multiplier
    pricing_mode text NOT NULL DEFAULT 'cost_multiplier', -- 'percentage' | 'cost_plus' | 'cost_multiplier'
    cost_plus_markup numeric(8,2) NOT NULL DEFAULT 2.0,
    can_recruit boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE (org_id, tier_key)
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_partner_tier_config_org ON partner_tier_config(org_id);

-- RLS
ALTER TABLE partner_tier_config ENABLE ROW LEVEL SECURITY;

-- Anyone in the org can read tier config (partners need it for display)
CREATE POLICY "org_members_select_tier_config"
ON partner_tier_config FOR SELECT
USING (
    org_id IN (
        SELECT ur.org_id FROM user_roles ur WHERE ur.user_id = auth.uid()
    )
);

-- Only admins can modify
CREATE POLICY "admins_insert_tier_config"
ON partner_tier_config FOR INSERT
WITH CHECK (
    org_id IN (
        SELECT ur.org_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
);

CREATE POLICY "admins_update_tier_config"
ON partner_tier_config FOR UPDATE
USING (
    org_id IN (
        SELECT ur.org_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
);

CREATE POLICY "admins_delete_tier_config"
ON partner_tier_config FOR DELETE
USING (
    org_id IN (
        SELECT ur.org_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
);

-- Super admin bypass (vendor can see all)
CREATE POLICY "super_admin_all_tier_config"
ON partner_tier_config FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_partner_tier_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_partner_tier_config_updated_at
    BEFORE UPDATE ON partner_tier_config
    FOR EACH ROW EXECUTE FUNCTION update_partner_tier_config_updated_at();

-- Seed default tiers for ALL existing organizations
INSERT INTO partner_tier_config (org_id, tier_key, label, emoji, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, can_recruit, sort_order)
SELECT
    o.id,
    t.tier_key,
    t.label,
    t.emoji,
    t.commission_rate,
    t.price_multiplier,
    t.pricing_mode,
    t.cost_plus_markup,
    t.can_recruit,
    t.sort_order
FROM organizations o
CROSS JOIN (
    VALUES
        ('senior',   'Senior Partner',   '🥇', 0.10, 2.0, 'cost_multiplier', 2.0, true,  1),
        ('standard', 'Standard Partner', '🥈', 0.10, 2.0, 'cost_multiplier', 2.0, false, 2),
        ('referral', 'Referral Partner', '🔗', 0.00, 2.0, 'cost_multiplier', 2.0, false, 3)
) AS t(tier_key, label, emoji, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, can_recruit, sort_order)
ON CONFLICT (org_id, tier_key) DO NOTHING;

-- Function to auto-seed tiers when a new org is created
CREATE OR REPLACE FUNCTION seed_partner_tiers_for_new_org()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO partner_tier_config (org_id, tier_key, label, emoji, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, can_recruit, sort_order)
    VALUES
        (NEW.id, 'senior',   'Senior Partner',   '🥇', 0.10, 2.0, 'cost_multiplier', 2.0, true,  1),
        (NEW.id, 'standard', 'Standard Partner', '🥈', 0.10, 2.0, 'cost_multiplier', 2.0, false, 2),
        (NEW.id, 'referral', 'Referral Partner', '🔗', 0.00, 2.0, 'cost_multiplier', 2.0, false, 3)
    ON CONFLICT (org_id, tier_key) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_seed_partner_tiers_on_org_create
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION seed_partner_tiers_for_new_org();
