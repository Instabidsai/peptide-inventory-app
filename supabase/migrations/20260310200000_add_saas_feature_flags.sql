-- Add new SaaS feature flags for ALL existing orgs so nothing changes for them.
-- saas_mode = false (existing orgs keep all features ON)
-- health_tracking, dose_tracking, client_health_ai = true (existing behavior preserved)
-- ruo_disclaimer = false (existing orgs do NOT get forced research disclaimers)
-- New SaaS tenants will get saas_mode=true + ruo_disclaimer=true via provision-tenant preset.

INSERT INTO org_features (id, org_id, feature_key, enabled)
SELECT gen_random_uuid(), o.id, f.key, f.default_val
FROM organizations o
CROSS JOIN (VALUES
  ('saas_mode', false),
  ('health_tracking', true),
  ('dose_tracking', true),
  ('client_health_ai', true),
  ('ruo_disclaimer', false)
) AS f(key, default_val)
WHERE NOT EXISTS (
  SELECT 1 FROM org_features of
  WHERE of.org_id = o.id AND of.feature_key = f.key
);
