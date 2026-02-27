-- Harden link_referral RPC:
-- 1. Check existing contacts by EMAIL too (not just linked_user_id) → prevents duplicates
-- 2. Verify profile was actually updated (FOUND check) → fail loudly
-- 3. Link existing contact by setting linked_user_id + assigned_rep_id
-- 4. Set parent_partner_id in addition to parent_rep_id (downline RPC checks both)
CREATE OR REPLACE FUNCTION public.link_referral(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_referrer_profile_id UUID,
  p_role TEXT DEFAULT 'customer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_org_id UUID;
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

  IF v_referrer_id IS NULL OR v_referrer_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referrer not found or has no organization');
  END IF;

  v_is_partner := (p_role = 'partner');
  v_app_role := CASE WHEN v_is_partner THEN 'sales_rep' ELSE 'client' END;
  v_contact_type := CASE WHEN v_is_partner THEN 'partner'::contact_type ELSE 'customer'::contact_type END;

  -- 2. Update new user's profile (bypasses RLS)
  UPDATE profiles SET
    org_id = v_referrer_org_id,
    parent_rep_id = v_referrer_id,
    parent_partner_id = CASE WHEN v_is_partner THEN v_referrer_id ELSE parent_partner_id END,
    role = v_app_role,
    partner_tier = CASE WHEN v_is_partner THEN 'associate' ELSE partner_tier END,
    commission_rate = CASE WHEN v_is_partner THEN 0.075 ELSE commission_rate END,
    price_multiplier = CASE WHEN v_is_partner THEN 1.0 ELSE 0.80 END,
    pricing_mode = CASE WHEN v_is_partner THEN 'cost_multiplier' ELSE pricing_mode END,
    cost_plus_markup = CASE WHEN v_is_partner THEN 2.0 ELSE cost_plus_markup END,
    updated_at = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found for user — please try again');
  END IF;

  -- 3. Upsert user_role (bypasses RLS)
  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_referrer_org_id, v_app_role::app_role)
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET role = EXCLUDED.role;

  -- 4. Find existing contact by linked_user_id OR by email (prevents duplicates)
  SELECT id, linked_user_id
  INTO v_existing_contact_id, v_existing_contact_linked
  FROM contacts
  WHERE org_id = v_referrer_org_id
    AND (
      linked_user_id = p_user_id
      OR (lower(email) = lower(p_email) AND linked_user_id IS NULL)
    )
  ORDER BY
    CASE WHEN linked_user_id = p_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_existing_contact_id IS NULL THEN
    -- No existing contact — create one
    INSERT INTO contacts (name, email, type, org_id, assigned_rep_id, linked_user_id)
    VALUES (
      COALESCE(NULLIF(p_full_name, ''), p_email),
      p_email,
      v_contact_type,
      v_referrer_org_id,
      v_referrer_id,
      p_user_id
    );
  ELSE
    -- Existing contact found — update it to link + assign to referrer
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
    'contact_linked', v_existing_contact_id IS NOT NULL
  );
END;
$$;
