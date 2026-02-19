-- ─────────────────────────────────────────────────────────────────────────────
-- Household Security Hardening — Audit Findings Fix
-- Fixes: #1 (claim_token leak), #2 (UPDATE WITH CHECK), #4 (atomic decrement),
--        #5 (remove member), #11 (input validation), #13 (household size limit)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #1: Remove claim_token from get_household_members return set
-- claim_token is a bearer credential — never expose to other household members
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_household_members(p_contact_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  household_role TEXT,
  is_linked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_household_id UUID;
  v_org_id UUID;
BEGIN
  SELECT c.household_id, c.org_id INTO v_household_id, v_org_id
  FROM public.contacts c WHERE c.id = p_contact_id;

  IF v_household_id IS NULL THEN
    RETURN;
  END IF;

  -- AUTH: caller must be a household member OR admin/sales_rep
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE household_id = v_household_id AND linked_user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND org_id = v_org_id AND role IN ('admin', 'sales_rep')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: not a household member or admin';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.name, c.email, c.household_role,
    (c.linked_user_id IS NOT NULL) AS is_linked
  FROM public.contacts c
  WHERE c.household_id = v_household_id
  ORDER BY
    CASE WHEN c.household_role = 'owner' THEN 0 ELSE 1 END,
    c.created_at ASC;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #2: Add WITH CHECK to household inventory UPDATE policy
-- Prevents changing contact_id to steal vials to a different household
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Household members can update shared inventory" ON public.client_inventory;

CREATE POLICY "Household members can update shared inventory"
ON public.client_inventory
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.contacts AS viewer
    JOIN public.contacts AS owner_c
      ON owner_c.id = public.client_inventory.contact_id
    WHERE viewer.linked_user_id = auth.uid()
      AND viewer.household_id IS NOT NULL
      AND viewer.household_id = owner_c.household_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.contacts AS viewer
    JOIN public.contacts AS owner_c
      ON owner_c.id = client_inventory.contact_id
    WHERE viewer.linked_user_id = auth.uid()
      AND viewer.household_id IS NOT NULL
      AND viewer.household_id = owner_c.household_id
  )
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #4: Atomic vial decrement — prevents race condition in shared households
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decrement_vial(
  p_vial_id UUID,
  p_dose_mg DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_qty DECIMAL;
  v_contact_id UUID;
  v_household_id UUID;
BEGIN
  -- AUTH: caller must own the vial OR be in the same household
  SELECT ci.contact_id INTO v_contact_id
  FROM client_inventory ci WHERE ci.id = p_vial_id;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vial not found');
  END IF;

  -- Check: direct owner OR household member
  IF NOT EXISTS (
    SELECT 1 FROM contacts WHERE id = v_contact_id AND linked_user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM contacts AS viewer
    JOIN contacts AS owner_c ON owner_c.id = v_contact_id
    WHERE viewer.linked_user_id = auth.uid()
      AND viewer.household_id IS NOT NULL
      AND viewer.household_id = owner_c.household_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Atomic decrement
  UPDATE client_inventory
  SET current_quantity_mg = GREATEST(0, current_quantity_mg - p_dose_mg),
      status = CASE WHEN GREATEST(0, current_quantity_mg - p_dose_mg) <= 0 THEN 'depleted' ELSE status END
  WHERE id = p_vial_id
  RETURNING current_quantity_mg INTO v_new_qty;

  RETURN jsonb_build_object('success', true, 'new_quantity_mg', v_new_qty);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #5: Remove household member RPC
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.remove_household_member(p_member_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_org_id UUID;
  v_role TEXT;
BEGIN
  SELECT household_id, org_id, household_role
  INTO v_household_id, v_org_id, v_role
  FROM contacts WHERE id = p_member_contact_id;

  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact is not in a household');
  END IF;

  -- Cannot remove the owner (dissolve the household instead)
  IF v_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove household owner. Dissolve the household instead.');
  END IF;

  -- AUTH: Must be admin/sales_rep in the org
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = v_org_id AND role IN ('admin', 'sales_rep')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admin/sales_rep can remove household members');
  END IF;

  -- Remove from household
  UPDATE contacts
  SET household_id = NULL, household_role = NULL
  WHERE id = p_member_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #11 + #13: Input validation + household size limit in add_household_member
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_household_member(
  p_owner_contact_id UUID,
  p_member_name TEXT,
  p_member_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
  v_org_id UUID;
  v_new_contact_id UUID;
  v_member_count INT;
BEGIN
  -- Input validation
  IF p_member_name IS NULL OR length(trim(p_member_name)) < 1 THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;
  IF length(p_member_name) > 200 THEN
    RAISE EXCEPTION 'Member name too long (max 200 characters)';
  END IF;
  IF p_member_email IS NOT NULL AND p_member_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Get owner's org
  SELECT org_id INTO v_org_id
  FROM public.contacts WHERE id = p_owner_contact_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- AUTH: Must be admin/sales_rep in the org OR the contact's own linked user
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND org_id = v_org_id AND role IN ('admin', 'sales_rep')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = p_owner_contact_id AND linked_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: not admin or contact owner';
  END IF;

  -- Get or create household
  SELECT household_id INTO v_household_id
  FROM public.contacts WHERE id = p_owner_contact_id;

  IF v_household_id IS NULL THEN
    v_household_id := public.create_household(p_owner_contact_id);
  END IF;

  -- Household size limit (max 10 members)
  SELECT count(*) INTO v_member_count
  FROM public.contacts WHERE household_id = v_household_id;

  IF v_member_count >= 10 THEN
    RAISE EXCEPTION 'Household member limit reached (max 10)';
  END IF;

  -- Create the member contact
  INSERT INTO public.contacts (
    name, email, org_id, type, tier,
    household_id, household_role
  )
  VALUES (
    trim(p_member_name), p_member_email, v_org_id,
    'customer', 'family', v_household_id, 'member'
  )
  RETURNING id INTO v_new_contact_id;

  RETURN v_new_contact_id;
END;
$$;
