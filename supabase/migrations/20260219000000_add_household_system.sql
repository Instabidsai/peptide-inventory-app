-- ─────────────────────────────────────────────────────────────────────────────
-- Household / Family Protocol System
-- Allows multiple contacts to share the same fridge inventory while
-- maintaining separate per-person protocols.
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 1: Add household columns to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS household_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS household_role TEXT DEFAULT NULL
    CHECK (household_role IN ('owner', 'member') OR household_role IS NULL);

CREATE INDEX IF NOT EXISTS contacts_household_id_idx ON public.contacts (household_id);


-- STEP 2: RLS — household members can READ the owner's client_inventory
DROP POLICY IF EXISTS "Household members can view shared inventory" ON public.client_inventory;

CREATE POLICY "Household members can view shared inventory"
ON public.client_inventory
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.contacts AS viewer
    JOIN public.contacts AS owner_c
      ON owner_c.id = public.client_inventory.contact_id
    WHERE viewer.linked_user_id = auth.uid()
      AND viewer.household_id IS NOT NULL
      AND viewer.household_id = owner_c.household_id
      AND viewer.id <> owner_c.id
  )
);


-- STEP 3: RLS — household members can UPDATE shared vials (for dose logging / decrement)
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
);


-- STEP 4: Re-add client self-update policy (was dropped by fix_client_inventory_rls)
-- Needed for clients to log doses and update their own vials
DROP POLICY IF EXISTS "Clients can update own inventory" ON public.client_inventory;

CREATE POLICY "Clients can update own inventory"
ON public.client_inventory
FOR UPDATE
USING (
  contact_id IN (SELECT id FROM public.contacts WHERE linked_user_id = auth.uid())
);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: RPC — create_household(p_owner_contact_id)
-- Promotes a solo contact to household owner. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_household(p_owner_contact_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
BEGIN
  SELECT household_id INTO v_household_id
  FROM public.contacts
  WHERE id = p_owner_contact_id;

  IF v_household_id IS NOT NULL THEN
    RETURN v_household_id;
  END IF;

  -- Use the owner's contact ID as the household ID
  v_household_id := p_owner_contact_id;

  UPDATE public.contacts
  SET household_id   = v_household_id,
      household_role = 'owner'
  WHERE id = p_owner_contact_id;

  RETURN v_household_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: RPC — add_household_member(p_owner_contact_id, p_name, p_email)
-- Creates a new contact in the same household. Auto-creates household if needed.
-- ─────────────────────────────────────────────────────────────────────────────

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
BEGIN
  -- Get or create household
  SELECT household_id, org_id
  INTO v_household_id, v_org_id
  FROM public.contacts
  WHERE id = p_owner_contact_id;

  IF v_household_id IS NULL THEN
    v_household_id := public.create_household(p_owner_contact_id);
  END IF;

  -- Create the member contact
  INSERT INTO public.contacts (
    name, email, org_id, type, tier,
    household_id, household_role
  )
  VALUES (
    p_member_name,
    p_member_email,
    v_org_id,
    'customer',
    'family',
    v_household_id,
    'member'
  )
  RETURNING id INTO v_new_contact_id;

  RETURN v_new_contact_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: RPC — get_household_members(p_contact_id)
-- Returns all contacts in the same household.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_household_members(p_contact_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  household_role TEXT,
  linked_user_id UUID,
  claim_token UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    c.id,
    c.name,
    c.email,
    c.household_role,
    c.linked_user_id,
    c.claim_token
  FROM public.contacts c
  WHERE c.household_id = (
    SELECT household_id FROM public.contacts WHERE id = p_contact_id
  )
  AND c.household_id IS NOT NULL
  ORDER BY
    CASE WHEN c.household_role = 'owner' THEN 0 ELSE 1 END,
    c.created_at ASC;
$$;
