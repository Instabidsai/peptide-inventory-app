-- Fix partner tier system:
-- 1. Fix link_referral RPC to use 'referral' tier with percentage pricing (20% off retail)
-- 2. Migrate existing 'associate' profiles to 'referral'
-- 3. Update referral tier_config defaults from cost_multiplier to percentage
-- 4. Clean up partner_tier on non-partner roles

-- ==========================================
-- 1. Fix the link_referral RPC
-- ==========================================
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

  -- 3. Update new user's profile (bypasses RLS)
  --    Partners start as 'referral' tier at 20% off retail (percentage mode, price_multiplier=0.80)
  UPDATE profiles SET
    org_id = v_target_org_id,
    parent_rep_id = v_referrer_id,
    parent_partner_id = CASE WHEN v_is_partner THEN v_referrer_id ELSE parent_partner_id END,
    role = v_app_role,
    partner_tier = CASE WHEN v_is_partner THEN 'referral' ELSE partner_tier END,
    commission_rate = CASE WHEN v_is_partner THEN 0.075 ELSE commission_rate END,
    price_multiplier = CASE WHEN v_is_partner THEN 0.80 ELSE price_multiplier END,
    pricing_mode = CASE WHEN v_is_partner THEN 'percentage' ELSE pricing_mode END,
    cost_plus_markup = CASE WHEN v_is_partner THEN 2.0 ELSE cost_plus_markup END,
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

-- ==========================================
-- 2. Migrate existing 'associate' profiles to 'referral'
-- ==========================================
UPDATE profiles
SET partner_tier = 'referral',
    pricing_mode = 'percentage',
    price_multiplier = 0.80,
    updated_at = now()
WHERE partner_tier = 'associate';

-- ==========================================
-- 3. Update referral tier_config defaults
-- ==========================================
UPDATE partner_tier_config
SET commission_rate = 0.075,
    price_multiplier = 0.80,
    pricing_mode = 'percentage',
    updated_at = now()
WHERE tier_key = 'referral';

-- Also update the seed function for new orgs
CREATE OR REPLACE FUNCTION seed_partner_tiers_for_new_org()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO partner_tier_config (org_id, tier_key, label, emoji, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, can_recruit, sort_order)
    VALUES
        (NEW.id, 'senior',   'Senior Partner',   '🥇', 0.10,  2.0,  'cost_multiplier', 2.0, true,  1),
        (NEW.id, 'standard', 'Standard Partner', '🥈', 0.10,  2.0,  'cost_multiplier', 2.0, false, 2),
        (NEW.id, 'referral', 'Referral Partner', '🔗', 0.075, 0.80, 'percentage',      2.0, false, 3)
    ON CONFLICT (org_id, tier_key) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 4. Clean up partner_tier on non-partner roles
--    Only sales_rep should have a partner_tier set
-- ==========================================
UPDATE profiles
SET partner_tier = NULL,
    updated_at = now()
WHERE role NOT IN ('sales_rep')
  AND partner_tier IS NOT NULL;
