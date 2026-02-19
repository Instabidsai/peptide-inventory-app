-- SECURITY DEFINER RPC to handle referral linking server-side.
-- Bypasses RLS so new users (with no org) can read referrer profiles
-- and create contacts without admin/staff role.
--
-- ROOT CAUSE: profiles SELECT RLS policy restricts reads to same-org
-- or own profile. New users have no org_id, so they cannot read the
-- referrer's profile, causing linkReferral to fail at step 1.
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
  v_existing_contact UUID;
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
    role = v_app_role,
    partner_tier = CASE WHEN v_is_partner THEN 'associate' ELSE partner_tier END,
    commission_rate = CASE WHEN v_is_partner THEN 0.075 ELSE commission_rate END,
    price_multiplier = CASE WHEN v_is_partner THEN 0.75 ELSE price_multiplier END,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- 3. Upsert user_role (bypasses RLS)
  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_referrer_org_id, v_app_role::app_role)
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET role = EXCLUDED.role;

  -- 4. Create contact if not exists (bypasses RLS)
  SELECT id INTO v_existing_contact
  FROM contacts
  WHERE linked_user_id = p_user_id AND org_id = v_referrer_org_id
  LIMIT 1;

  IF v_existing_contact IS NULL THEN
    INSERT INTO contacts (name, email, type, org_id, assigned_rep_id, linked_user_id)
    VALUES (
      COALESCE(NULLIF(p_full_name, ''), p_email),
      p_email,
      v_contact_type,
      v_referrer_org_id,
      v_referrer_id,
      p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'type', CASE WHEN v_is_partner THEN 'partner' ELSE 'customer' END
  );
END;
$$;
