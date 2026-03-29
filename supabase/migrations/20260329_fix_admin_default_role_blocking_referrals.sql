-- ============================================================================
-- FIX: profiles.role DEFAULT 'admin' causes ALL new signups to be blocked
-- by link_referral's admin guard
-- ============================================================================
-- ROOT CAUSE: The profiles.role column has DEFAULT 'admin'. When handle_new_user()
-- creates a profile on signup, it doesn't set role, so every new user gets
-- role='admin'. Then link_referral checks role and blocks them with:
--   "Admin accounts cannot be reassigned via referral links."
--
-- This broke ALL partner invite links — new users could never sign up via them.
--
-- FIX:
--   1. Change column default from 'admin' to NULL
--   2. Update link_referral guard: only block REAL admins (admin + has org_id)
--   3. Update auto_link_contact_by_email guard: same logic
--   4. Backfill: clear role='admin' on profiles with no org (phantom admins)
-- ============================================================================

-- ============================================================================
-- FIX 1: Change the column default so new signups don't get role='admin'
-- ============================================================================
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT NULL;

-- ============================================================================
-- FIX 2: Backfill — clear phantom admin roles (admin + no org = not a real admin)
-- ============================================================================
UPDATE profiles
SET role = NULL, updated_at = now()
WHERE role = 'admin'
  AND org_id IS NULL;

-- ============================================================================
-- FIX 3: Update link_referral — only block real admins (admin WITH an org)
-- ============================================================================
DROP FUNCTION IF EXISTS public.link_referral(uuid, text, text, uuid, text, uuid, text);
CREATE OR REPLACE FUNCTION public.link_referral(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_referrer_profile_id UUID,
  p_role TEXT DEFAULT 'customer',
  p_org_id UUID DEFAULT NULL,
  p_tier TEXT DEFAULT 'standard'
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
  v_tier_key TEXT;
  v_current_role TEXT;
  v_current_org_id UUID;
  v_is_privileged BOOLEAN;
  -- Tier config values (read from DB or fallback)
  v_tier_commission NUMERIC;
  v_tier_price_multiplier NUMERIC;
  v_tier_pricing_mode TEXT;
  v_tier_cost_plus_markup NUMERIC;
BEGIN
  -- *** GUARD: Check if user is admin or super_admin BEFORE any changes ***
  SELECT role, org_id INTO v_current_role, v_current_org_id
  FROM profiles WHERE user_id = p_user_id;

  -- Only block REAL admins — users who have role='admin' AND belong to an org.
  -- New signups with no org_id are not real admins (they just had a bad column default).
  IF v_current_role = 'admin' AND v_current_org_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Admin accounts cannot be reassigned via referral links. Sign out and use a different account.');
  END IF;

  v_is_privileged := EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = 'super_admin'
  );
  IF v_is_privileged THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Super admin accounts cannot be reassigned via referral links. Sign out and use a different account.');
  END IF;

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

  -- Sanitize tier key — only allow known values, default to 'standard'
  v_tier_key := CASE
    WHEN lower(COALESCE(p_tier, 'standard')) IN ('standard', 'senior', 'referral') THEN lower(p_tier)
    ELSE 'standard'
  END;

  -- 2b. If partner, read tier config from DB so we use admin-configured values
  IF v_is_partner THEN
    SELECT commission_rate, price_multiplier, pricing_mode, cost_plus_markup
    INTO v_tier_commission, v_tier_price_multiplier, v_tier_pricing_mode, v_tier_cost_plus_markup
    FROM partner_tier_config
    WHERE org_id = v_target_org_id
      AND tier_key = v_tier_key
      AND active = true
    LIMIT 1;

    -- If requested tier not found, try 'standard' as fallback
    IF v_tier_commission IS NULL AND v_tier_key != 'standard' THEN
      SELECT commission_rate, price_multiplier, pricing_mode, cost_plus_markup
      INTO v_tier_commission, v_tier_price_multiplier, v_tier_pricing_mode, v_tier_cost_plus_markup
      FROM partner_tier_config
      WHERE org_id = v_target_org_id
        AND tier_key = 'standard'
        AND active = true
      LIMIT 1;
      IF v_tier_commission IS NOT NULL THEN
        v_tier_key := 'standard';
      END IF;
    END IF;

    -- Fallback defaults if no tier config exists at all
    v_tier_commission       := COALESCE(v_tier_commission, 0.10);
    v_tier_price_multiplier := COALESCE(v_tier_price_multiplier, 0.75);
    v_tier_pricing_mode     := COALESCE(v_tier_pricing_mode, 'percentage');
    v_tier_cost_plus_markup := COALESCE(v_tier_cost_plus_markup, 2.0);
  END IF;

  -- 3. Update new user's profile (bypasses RLS)
  UPDATE profiles SET
    org_id = v_target_org_id,
    parent_rep_id = v_referrer_id,
    parent_partner_id = CASE WHEN v_is_partner THEN v_referrer_id ELSE parent_partner_id END,
    role = v_app_role,
    partner_tier = CASE WHEN v_is_partner THEN v_tier_key ELSE partner_tier END,
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
      assigned_rep_id = v_referrer_id,
      type = v_contact_type,
      name = COALESCE(NULLIF(name, ''), NULLIF(p_full_name, ''), p_email),
      updated_at = now()
    WHERE id = v_existing_contact_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'type', CASE WHEN v_is_partner THEN 'partner' ELSE 'customer' END,
    'tier', v_tier_key,
    'contact_linked', v_existing_contact_id IS NOT NULL,
    'org_id', v_target_org_id
  );
END;
$$;

-- ============================================================================
-- FIX 4: auto_link_contact_by_email — same guard fix
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_link_contact_by_email(p_user_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_contact record;
  v_profile_id uuid;
  v_profile_role text;
  v_profile_org_id uuid;
  v_contact_role text;
  v_is_privileged boolean;
BEGIN
  -- Find an unlinked contact whose email matches
  SELECT id, org_id, type, assigned_rep_id
  INTO v_contact
  FROM contacts
  WHERE lower(email) = lower(p_email)
    AND linked_user_id IS NULL
    AND org_id IS NOT NULL
  LIMIT 1;

  IF v_contact IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  -- Get the user's profile
  SELECT id, role, org_id INTO v_profile_id, v_profile_role, v_profile_org_id
  FROM profiles WHERE user_id = p_user_id;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'error', 'profile_not_found');
  END IF;

  -- GUARD: Never overwrite REAL admin profiles (admin WITH an org)
  -- New signups with no org_id are not real admins.
  IF v_profile_role = 'admin' AND v_profile_org_id IS NOT NULL THEN
    RETURN jsonb_build_object('matched', false, 'error', 'admin_protected',
      'detail', 'Admin profiles cannot be auto-linked to a different org');
  END IF;

  -- GUARD: Never overwrite super_admin profiles
  v_is_privileged := EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  );
  IF v_is_privileged THEN
    RETURN jsonb_build_object('matched', false, 'error', 'super_admin_protected',
      'detail', 'Super admin profiles cannot be auto-linked');
  END IF;

  -- GUARD: Don't overwrite profiles that already have an org_id
  IF v_profile_org_id IS NOT NULL THEN
    RETURN jsonb_build_object('matched', false, 'error', 'already_has_org',
      'detail', 'Profile already belongs to an organization');
  END IF;

  -- Determine role: partners become sales_rep, everyone else becomes client
  v_contact_role := CASE WHEN v_contact.type = 'partner' THEN 'sales_rep' ELSE 'client' END;

  -- Update the profile with the org and role
  UPDATE profiles SET
    org_id = v_contact.org_id,
    role = v_contact_role
  WHERE id = v_profile_id;

  -- Insert or update the user_roles entry
  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_contact.org_id, v_contact_role::app_role)
  ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role;

  -- Mark the contact as linked
  UPDATE contacts SET linked_user_id = p_user_id WHERE id = v_contact.id;

  RETURN jsonb_build_object(
    'matched', true,
    'contact_id', v_contact.id,
    'org_id', v_contact.org_id,
    'role', v_contact_role
  );
END;
$$;
