-- ============================================================================
-- FIX: link_referral RPC should read tier config from partner_tier_config
-- instead of hardcoding commission_rate, price_multiplier, pricing_mode.
-- ============================================================================
-- ROOT CAUSE: Admin can update tier pricing via TierConfigTab UI, but the
-- link_referral RPC ignores those changes and hardcodes fixed values.
-- This causes a mismatch: the tier badge says "50% off" (from tier config)
-- but the actual prices are 20% off (from the hardcoded profile values).
--
-- FIX: Read from partner_tier_config for the org's referral tier, falling
-- back to safe defaults if no config exists.
-- ============================================================================

DROP FUNCTION IF EXISTS public.link_referral(uuid, text, text, uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.link_referral(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_referrer_profile_id UUID,
  p_role TEXT DEFAULT 'customer',
  p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_org_id UUID;
  v_target_org_id UUID;
  v_is_partner BOOLEAN;
  v_app_role TEXT;
  v_contact_type contact_type;
  v_existing_contact_id UUID;
  v_existing_contact_linked UUID;
  v_rows_affected INT;
  -- Tier config values (read from DB or fallback)
  v_tier_commission NUMERIC;
  v_tier_price_multiplier NUMERIC;
  v_tier_pricing_mode TEXT;
  v_tier_cost_plus_markup NUMERIC;
BEGIN
  -- 1. Look up referrer (bypasses RLS via SECURITY DEFINER)
  SELECT id, org_id INTO v_referrer_id, v_referrer_org_id
  FROM profiles
  WHERE id = p_referrer_profile_id;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referrer not found');
  END IF;

  -- 2. Determine target org: use p_org_id if provided and valid, else referrer's org
  IF p_org_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
      v_target_org_id := p_org_id;
    ELSE
      v_target_org_id := v_referrer_org_id;
    END IF;
  ELSE
    v_target_org_id := v_referrer_org_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No valid organization found');
  END IF;

  v_is_partner := (p_role = 'partner');
  v_app_role := CASE WHEN v_is_partner THEN 'sales_rep' ELSE 'client' END;
  v_contact_type := CASE WHEN v_is_partner THEN 'partner'::contact_type ELSE 'customer'::contact_type END;

  -- 2b. If partner, read tier config from DB so we use admin-configured values
  IF v_is_partner THEN
    SELECT commission_rate, price_multiplier, pricing_mode, cost_plus_markup
    INTO v_tier_commission, v_tier_price_multiplier, v_tier_pricing_mode, v_tier_cost_plus_markup
    FROM partner_tier_config
    WHERE org_id = v_target_org_id
      AND tier_key = 'referral'
      AND active = true
    LIMIT 1;

    -- Fallback defaults if no tier config exists
    v_tier_commission       := COALESCE(v_tier_commission, 0.075);
    v_tier_price_multiplier := COALESCE(v_tier_price_multiplier, 0.80);
    v_tier_pricing_mode     := COALESCE(v_tier_pricing_mode, 'percentage');
    v_tier_cost_plus_markup := COALESCE(v_tier_cost_plus_markup, 2.0);
  END IF;

  -- 3. Update new user's profile (bypasses RLS)
  --    Partners get tier config values from partner_tier_config (or fallback defaults)
  UPDATE profiles SET
    org_id = v_target_org_id,
    parent_rep_id = v_referrer_id,
    parent_partner_id = CASE WHEN v_is_partner THEN v_referrer_id ELSE parent_partner_id END,
    role = v_app_role,
    partner_tier = CASE WHEN v_is_partner THEN 'referral' ELSE partner_tier END,
    commission_rate = CASE WHEN v_is_partner THEN v_tier_commission ELSE commission_rate END,
    price_multiplier = CASE WHEN v_is_partner THEN v_tier_price_multiplier ELSE price_multiplier END,
    pricing_mode = CASE WHEN v_is_partner THEN v_tier_pricing_mode ELSE pricing_mode END,
    cost_plus_markup = CASE WHEN v_is_partner THEN v_tier_cost_plus_markup ELSE cost_plus_markup END,
    updated_at = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found for user — please try again');
  END IF;

  -- 4. Upsert user_role (bypasses RLS)
  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_target_org_id, v_app_role::app_role)
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET role = EXCLUDED.role;

  -- 5. Find existing contact by linked_user_id OR by email (prevents duplicates)
  SELECT id, linked_user_id
  INTO v_existing_contact_id, v_existing_contact_linked
  FROM contacts
  WHERE org_id = v_target_org_id
    AND (
      linked_user_id = p_user_id
      OR (lower(email) = lower(p_email) AND linked_user_id IS NULL)
    )
  ORDER BY
    CASE WHEN linked_user_id = p_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_existing_contact_id IS NULL THEN
    INSERT INTO contacts (name, email, type, org_id, assigned_rep_id, linked_user_id)
    VALUES (
      COALESCE(NULLIF(p_full_name, ''), p_email),
      p_email,
      v_contact_type,
      v_target_org_id,
      v_referrer_id,
      p_user_id
    );
  ELSE
    UPDATE contacts SET
      linked_user_id = p_user_id,
      assigned_rep_id = COALESCE(assigned_rep_id, v_referrer_id),
      type = v_contact_type,
      name = COALESCE(NULLIF(name, ''), NULLIF(p_full_name, ''), p_email),
      updated_at = now()
    WHERE id = v_existing_contact_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'type', CASE WHEN v_is_partner THEN 'partner' ELSE 'customer' END,
    'contact_linked', v_existing_contact_id IS NOT NULL,
    'org_id', v_target_org_id
  );
END;
$$;
