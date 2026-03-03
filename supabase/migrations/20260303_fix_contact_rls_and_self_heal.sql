-- ============================================================================
-- FIX: Client portal routing bug — missing contact blocks all navigation
-- ============================================================================
-- ROOT CAUSE: The "Users can view own contact link" RLS policy exists in
-- schema-master.sql but was never deployed as a migration. New customers
-- who sign up via referral link get a contact created by the link_referral
-- RPC (SECURITY DEFINER), but the contacts_org_read RLS policy can fail
-- to let them READ their own contact if there's any timing/caching issue.
--
-- FIX 1: Deploy the missing self-read RLS policy on contacts.
-- FIX 2: Create ensure_customer_contact() RPC for self-healing — if a
--         customer somehow ends up without a contact, the client app can
--         call this to auto-create one.
-- ============================================================================

-- ============================================================================
-- FIX 1: Add "Users can view own contact link" RLS policy
-- This allows ANY authenticated user to read contacts where they are the
-- linked_user_id, regardless of org matching. Critical safety net.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts'
      AND policyname = 'contacts_self_read_by_linked_user'
  ) THEN
    CREATE POLICY contacts_self_read_by_linked_user ON public.contacts
      FOR SELECT TO authenticated
      USING (linked_user_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- FIX 2: ensure_customer_contact() — self-healing RPC
-- Called by the client when useClientProfile returns null after a timeout.
-- Creates a minimal contact record so the customer isn't stuck on the spinner.
-- SECURITY DEFINER so it can bypass RLS to read profiles and insert contacts.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_customer_contact(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_existing_contact_id UUID;
  v_new_contact_id UUID;
BEGIN
  -- 1. Fetch the user's profile
  SELECT id, org_id, email, full_name, role
  INTO v_profile
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_profile');
  END IF;

  IF v_profile.org_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_org');
  END IF;

  -- 2. Check if a contact already exists (by linked_user_id or email)
  SELECT id INTO v_existing_contact_id
  FROM contacts
  WHERE org_id = v_profile.org_id
    AND (
      linked_user_id = p_user_id
      OR (lower(email) = lower(v_profile.email) AND linked_user_id IS NULL)
    )
  ORDER BY
    CASE WHEN linked_user_id = p_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_existing_contact_id IS NOT NULL THEN
    -- Contact exists but might not be linked — ensure linked_user_id is set
    UPDATE contacts
    SET linked_user_id = p_user_id,
        updated_at = now()
    WHERE id = v_existing_contact_id
      AND (linked_user_id IS NULL OR linked_user_id = p_user_id);

    RETURN jsonb_build_object('created', false, 'linked', true, 'contact_id', v_existing_contact_id);
  END IF;

  -- 3. No contact found — create a minimal one
  INSERT INTO contacts (name, email, type, org_id, linked_user_id)
  VALUES (
    COALESCE(NULLIF(v_profile.full_name, ''), v_profile.email, 'Customer'),
    v_profile.email,
    CASE WHEN v_profile.role = 'sales_rep' THEN 'partner'::contact_type ELSE 'customer'::contact_type END,
    v_profile.org_id,
    p_user_id
  )
  RETURNING id INTO v_new_contact_id;

  RETURN jsonb_build_object('created', true, 'contact_id', v_new_contact_id);
END;
$$;
