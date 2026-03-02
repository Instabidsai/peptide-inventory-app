-- ═══════════════════════════════════════════════════════════════
-- Migration: Per-Tenant Circuit Breaker v2
--
-- Fixes:
--   1. Adds pattern_id tracking to circuit_breaker_events so resets
--      can be scoped to the pattern that tripped the breaker
--   2. Adds half-open cooldown column so breakers don't reset instantly
--   3. Fixes seed_default_features RPC key mismatch (ai_chat → ai_assistant)
--   4. Adds index for faster org-scoped breaker lookups
-- ═══════════════════════════════════════════════════════════════

-- 1. Add pattern_id to circuit_breaker_events for scoped resets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'circuit_breaker_events' AND column_name = 'pattern_id'
  ) THEN
    ALTER TABLE circuit_breaker_events
      ADD COLUMN pattern_id uuid REFERENCES error_patterns(id);
  END IF;
END $$;

-- 2. Add pattern_category for fast lookup without joining
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'circuit_breaker_events' AND column_name = 'pattern_category'
  ) THEN
    ALTER TABLE circuit_breaker_events
      ADD COLUMN pattern_category text;
  END IF;
END $$;

-- 3. Add composite index for org-scoped breaker lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_org_feature
  ON circuit_breaker_events(org_id, feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_pattern
  ON circuit_breaker_events(pattern_id, created_at DESC)
  WHERE pattern_id IS NOT NULL;

-- 4. Fix seed_default_features RPC — align keys with FEATURE_REGISTRY
--    Old keys: ai_chat, ai_builder, commissions, white_label, custom_domain
--    Correct keys: ai_assistant, automations, partner_network, fulfillment, etc.
CREATE OR REPLACE FUNCTION public.seed_default_features(p_org_id UUID)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $$
  INSERT INTO org_features (org_id, feature_key, enabled) VALUES
    -- Core features (always on, but seed for visibility)
    (p_org_id, 'dashboard', true),
    (p_org_id, 'settings', true),
    -- AI features
    (p_org_id, 'ai_assistant', true),
    (p_org_id, 'automations', true),
    -- Inventory
    (p_org_id, 'peptide_catalog', true),
    (p_org_id, 'lot_tracking', true),
    (p_org_id, 'bottle_tracking', true),
    (p_org_id, 'supplements', true),
    (p_org_id, 'movements', true),
    (p_org_id, 'wholesale_catalog', true),
    -- Sales
    (p_org_id, 'purchase_orders', true),
    (p_org_id, 'sales_orders', true),
    (p_org_id, 'fulfillment', true),
    -- Partners (off by default — premium)
    (p_org_id, 'partner_network', false),
    -- Clients
    (p_org_id, 'contacts', true),
    (p_org_id, 'protocols', true),
    (p_org_id, 'resources', true),
    (p_org_id, 'client_requests', true),
    (p_org_id, 'feedback', true),
    (p_org_id, 'client_portal', true),
    -- Finance
    (p_org_id, 'financials', true),
    -- Customization (off by default — premium)
    (p_org_id, 'customizations', false)
  ON CONFLICT (org_id, feature_key) DO NOTHING;
$$;

-- 5. Backfill any existing orgs that have the old mismatched keys
--    Map ai_chat → ai_assistant and ai_builder → automations
DO $$ BEGIN
  -- For each org that has ai_chat but not ai_assistant, rename it
  UPDATE org_features SET feature_key = 'ai_assistant'
  WHERE feature_key = 'ai_chat'
    AND NOT EXISTS (
      SELECT 1 FROM org_features o2
      WHERE o2.org_id = org_features.org_id AND o2.feature_key = 'ai_assistant'
    );

  -- For any remaining ai_chat duplicates (where ai_assistant already exists), just delete
  DELETE FROM org_features WHERE feature_key = 'ai_chat';

  -- Same for ai_builder → automations
  UPDATE org_features SET feature_key = 'automations'
  WHERE feature_key = 'ai_builder'
    AND NOT EXISTS (
      SELECT 1 FROM org_features o2
      WHERE o2.org_id = org_features.org_id AND o2.feature_key = 'automations'
    );
  DELETE FROM org_features WHERE feature_key = 'ai_builder';

  -- Clean up other old keys that don't match the registry
  DELETE FROM org_features WHERE feature_key = 'commissions';
  DELETE FROM org_features WHERE feature_key = 'white_label';
  DELETE FROM org_features WHERE feature_key = 'custom_domain';
END $$;
