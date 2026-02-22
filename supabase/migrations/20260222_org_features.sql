-- Feature flags per organization
-- Allows CRM admins to toggle features on/off for their team

CREATE TABLE IF NOT EXISTS org_features (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, feature_key)
);

ALTER TABLE org_features ENABLE ROW LEVEL SECURITY;

-- All org members can READ their org's features (needed for sidebar filtering)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'org_features' AND policyname = 'org_features_read'
  ) THEN
    CREATE POLICY org_features_read ON org_features
      FOR SELECT USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Admin can manage their org's features
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'org_features' AND policyname = 'org_features_admin_write'
  ) THEN
    CREATE POLICY org_features_admin_write ON org_features
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.org_id = org_features.org_id
          AND user_roles.role = 'admin'
        )
      );
  END IF;
END $$;

-- Super admin can manage all orgs' features
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'org_features' AND policyname = 'org_features_super_admin'
  ) THEN
    CREATE POLICY org_features_super_admin ON org_features
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- Seed features for existing orgs that don't have them yet
INSERT INTO org_features (org_id, feature_key, enabled)
SELECT o.id, f.key, true
FROM organizations o
CROSS JOIN (
  VALUES
    ('ai_assistant'), ('peptide_catalog'), ('lot_tracking'), ('bottle_tracking'),
    ('supplements'), ('movements'), ('purchase_orders'), ('sales_orders'),
    ('fulfillment'), ('partner_network'), ('financials'), ('automations'),
    ('contacts'), ('protocols'), ('resources'), ('client_requests'),
    ('feedback'), ('client_portal'), ('customizations')
) AS f(key)
WHERE NOT EXISTS (
  SELECT 1 FROM org_features of2
  WHERE of2.org_id = o.id AND of2.feature_key = f.key
);
