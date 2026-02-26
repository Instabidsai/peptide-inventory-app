-- Migration: auto_link_contact_by_email RPC
-- Source: scripts/schema-master.sql lines 1145-1193
-- Called from: src/contexts/AuthContext.tsx line 110
-- Purpose: When a new user signs up, check if their email matches an existing
--          contact record (created by an org admin). If so, auto-link the user
--          to that organization with the appropriate role.

CREATE OR REPLACE FUNCTION public.auto_link_contact_by_email(p_user_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_contact record;
  v_profile_id uuid;
  v_contact_role text;
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
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = p_user_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'error', 'profile_not_found');
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
