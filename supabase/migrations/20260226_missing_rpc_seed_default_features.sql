-- Migration: seed_default_features RPC
-- Source: scripts/20260224_extended_branding.sql lines 108-120
-- Called from: src/pages/merchant/MerchantOnboarding.tsx line 607
-- Purpose: Seed the org_features table with default feature flags when
--          a new tenant/organization is created during merchant onboarding.
--          Uses ON CONFLICT DO NOTHING so it is safe to call multiple times.

CREATE OR REPLACE FUNCTION public.seed_default_features(p_org_id UUID)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $$
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
$$;
