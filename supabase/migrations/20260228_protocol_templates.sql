-- Per-org protocol templates
-- Allows each organization to customize their own protocol template library.

CREATE TABLE IF NOT EXISTS protocol_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'full',
  icon text NOT NULL DEFAULT 'Sparkles',
  peptide_names text[] NOT NULL DEFAULT '{}',
  default_tier_id text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);

ALTER TABLE protocol_templates ENABLE ROW LEVEL SECURITY;

-- All org members can READ their org's templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_templates' AND policyname = 'protocol_templates_read'
  ) THEN
    CREATE POLICY protocol_templates_read ON protocol_templates
      FOR SELECT USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Admin can manage their org's templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_templates' AND policyname = 'protocol_templates_admin_write'
  ) THEN
    CREATE POLICY protocol_templates_admin_write ON protocol_templates
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.org_id = protocol_templates.org_id
          AND user_roles.role = 'admin'
        )
      );
  END IF;
END $$;

-- Super admin can manage all orgs' templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_templates' AND policyname = 'protocol_templates_super_admin'
  ) THEN
    CREATE POLICY protocol_templates_super_admin ON protocol_templates
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- Seed the 13 default templates for every existing organization
INSERT INTO protocol_templates (org_id, name, description, category, icon, peptide_names, default_tier_id, sort_order)
SELECT o.id, t.name, t.description, t.category, t.icon, t.peptide_names, t.default_tier_id, t.sort_order
FROM organizations o
CROSS JOIN (
  VALUES
    ('Healing Stack',           'TB-500 20mg + BPC-157 20mg for tissue repair and recovery',                                        'healing',    'Heart',      ARRAY['TB500 20mg','BPC-157 20mg'],                        NULL,      1),
    ('Healing Stack (Injury)',  'TB-500 20mg aggressive loading + BPC-157 20mg 2x daily for acute injuries',                        'healing',    'Heart',      ARRAY['TB500 20mg','BPC-157 20mg'],                        'injury',  2),
    ('GH Stack (Evening)',      'Ipamorelin + 2x Tesamorelin 20mg for growth hormone optimization',                                 'gh_stack',   'TrendingUp', ARRAY['Ipamorelin','Tesamorelin 20mg','Tesamorelin 20mg'], NULL,      3),
    ('Weight Loss',             'Retatrutide + MOTS-C for metabolic enhancement',                                                   'weight_loss','Flame',      ARRAY['Retatrutide','MOTS-C'],                             NULL,      4),
    ('Weight Loss (Gentle)',    'Retatrutide gentle start + MOTS-C conservative for GI-sensitive clients',                          'weight_loss','Flame',      ARRAY['Retatrutide','MOTS-C'],                             'gentle',  5),
    ('Cognitive',               'Semax + Selank for focus and anxiety reduction',                                                    'cognitive',  'Brain',      ARRAY['Semax','Selank'],                                   NULL,      6),
    ('Sleep & Recovery',        'DSIP + NAD+ for restorative sleep and cellular repair',                                            'sleep',      'Moon',       ARRAY['DSIP','NAD+'],                                      NULL,      7),
    ('Anti-Aging',              'GHK-Cu + NAD+ + MOTS-C for longevity and skin health',                                             'anti_aging', 'Sparkles',   ARRAY['GHK-Cu','NAD+','MOTS-C'],                           NULL,      8),
    ('GLOW',                    'GHK-Cu + BPC-157 20mg + TB-500 20mg for skin rejuvenation, collagen synthesis, and tissue repair',  'anti_aging', 'Sparkles',   ARRAY['GHK-Cu','BPC-157 20mg','TB500 20mg'],               NULL,      9),
    ('KLOW',                    'GLOW stack + KPV for enhanced anti-inflammatory support and immune modulation',                     'anti_aging', 'Sparkles',   ARRAY['GHK-Cu','BPC-157 20mg','TB500 20mg','KPV'],         NULL,     10),
    ('Gut Healing',             'BPC-157 20mg + KPV for gut lining repair and inflammation',                                        'healing',    'Heart',      ARRAY['BPC-157 20mg','KPV'],                               NULL,     11),
    ('Immune Boost',            'Thymosin Alpha-1 + NAD+ for immune function and cellular energy',                                   'healing',    'Shield',     ARRAY['Thymosin Alpha-1','NAD+'],                          NULL,     12),
    ('Longevity',               'Epithalon + NAD+ + GHK-Cu for telomere support, cellular repair, and skin health',                 'anti_aging', 'Sparkles',   ARRAY['Epithalon','NAD+','GHK-Cu'],                        NULL,     13)
) AS t(name, description, category, icon, peptide_names, default_tier_id, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM protocol_templates pt
  WHERE pt.org_id = o.id AND pt.name = t.name
);
