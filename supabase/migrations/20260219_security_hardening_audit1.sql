-- ─────────────────────────────────────────────────────────────────────────────
-- Security Hardening — Audit Loop 1 Fixes
-- Problems: #3 (sales_orders RLS), #4 (sales_order_items RLS),
--           #8 (link_referral auth), #9 (household auth),
--           #11 (profiles exposure), #12 (total_amount trigger)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #3: sales_orders DELETE/UPDATE RLS = USING(true) for ALL authenticated
-- FIX: Only admin/sales_rep can DELETE/UPDATE. Clients can update own draft orders.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated Staff Delete Orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Authenticated Staff Update Orders" ON public.sales_orders;

-- Admin/sales_rep can delete orders in their org
CREATE POLICY "Admin/rep can delete org orders"
ON public.sales_orders FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.org_id = sales_orders.org_id
      AND ur.role IN ('admin', 'sales_rep')
  )
);

-- Admin/sales_rep can update any order in their org
CREATE POLICY "Admin/rep can update org orders"
ON public.sales_orders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.org_id = sales_orders.org_id
      AND ur.role IN ('admin', 'sales_rep')
  )
);

-- Clients can update their own draft/submitted orders (cancel, etc.)
CREATE POLICY "Client can update own draft orders"
ON public.sales_orders FOR UPDATE TO authenticated
USING (
  client_id IN (SELECT id FROM public.contacts WHERE linked_user_id = auth.uid())
  AND status IN ('draft', 'submitted')
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #4: sales_order_items missing INSERT RLS; DELETE = USING(true)
-- FIX: Only admin/sales_rep can INSERT/DELETE/UPDATE items directly.
--      Client orders go through create_validated_order RPC (SECURITY DEFINER).
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated Staff Delete Order Items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Org members can insert order items" ON public.sales_order_items;

-- Admin/sales_rep can delete order items
CREATE POLICY "Admin/rep can delete order items"
ON public.sales_order_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_orders so
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.org_id = so.org_id
    WHERE so.id = sales_order_items.sales_order_id
      AND ur.role IN ('admin', 'sales_rep')
  )
);

-- Admin/sales_rep can insert order items
CREATE POLICY "Admin/rep can insert order items"
ON public.sales_order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_orders so
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.org_id = so.org_id
    WHERE so.id = sales_order_items.sales_order_id
      AND ur.role IN ('admin', 'sales_rep')
  )
);

-- Admin/sales_rep can update order items (quantity changes)
DROP POLICY IF EXISTS "Admin/rep can update order items" ON public.sales_order_items;
CREATE POLICY "Admin/rep can update order items"
ON public.sales_order_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_orders so
    JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.org_id = so.org_id
    WHERE so.id = sales_order_items.sales_order_id
      AND ur.role IN ('admin', 'sales_rep')
  )
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #8: link_referral RPC has no auth.uid() == p_user_id check
-- FIX: Caller can only link their own account
-- ═══════════════════════════════════════════════════════════════════════════════

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
  -- AUTH CHECK: caller can only link their own account
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: can only link own account');
  END IF;

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
    price_multiplier = CASE WHEN v_is_partner THEN 1.0 ELSE 0.80 END,
    pricing_mode = CASE WHEN v_is_partner THEN 'cost_multiplier' ELSE pricing_mode END,
    cost_plus_markup = CASE WHEN v_is_partner THEN 2.0 ELSE cost_plus_markup END,
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


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #9: Household RPCs have no authorization — any user can add members
-- FIX: Require admin/sales_rep or the contact's own linked user
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_household(p_owner_contact_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
  v_linked_user UUID;
  v_org_id UUID;
BEGIN
  -- Look up the contact
  SELECT linked_user_id, org_id INTO v_linked_user, v_org_id
  FROM public.contacts WHERE id = p_owner_contact_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- AUTH: Must be the contact's own user or admin/sales_rep in the org
  IF v_linked_user IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND org_id = v_org_id AND role IN ('admin', 'sales_rep')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: not contact owner or admin';
    END IF;
  END IF;

  -- Already has household? Return it.
  SELECT household_id INTO v_household_id
  FROM public.contacts WHERE id = p_owner_contact_id;

  IF v_household_id IS NOT NULL THEN
    RETURN v_household_id;
  END IF;

  v_household_id := p_owner_contact_id;

  UPDATE public.contacts
  SET household_id   = v_household_id,
      household_role = 'owner'
  WHERE id = p_owner_contact_id;

  RETURN v_household_id;
END;
$$;


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

  -- Create the member contact
  INSERT INTO public.contacts (
    name, email, org_id, type, tier,
    household_id, household_role
  )
  VALUES (
    p_member_name, p_member_email, v_org_id,
    'customer', 'family', v_household_id, 'member'
  )
  RETURNING id INTO v_new_contact_id;

  RETURN v_new_contact_id;
END;
$$;


-- get_household_members: add auth check
CREATE OR REPLACE FUNCTION public.get_household_members(p_contact_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  household_role TEXT,
  linked_user_id UUID,
  claim_token UUID
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
    c.id, c.name, c.email, c.household_role, c.linked_user_id, c.claim_token
  FROM public.contacts c
  WHERE c.household_id = v_household_id
  ORDER BY
    CASE WHEN c.household_role = 'owner' THEN 0 ELSE 1 END,
    c.created_at ASC;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #11: profiles SELECT RLS = USING(true) exposes pricing data to all
-- FIX: Own profile + same org only. SECURITY DEFINER RPCs bypass this.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop all existing SELECT policies on profiles
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- Users can see their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can see profiles in their org (for rep names, team views, etc.)
CREATE POLICY "Users can view org profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  org_id IS NOT NULL
  AND org_id = public.get_user_org_id(auth.uid())
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEM #12: total_amount computed client-side can be manipulated
-- FIX: Trigger recalculates total_amount from items on any item change
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalc_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_new_total DECIMAL(10,2);
BEGIN
  -- Determine which order was affected
  v_order_id := COALESCE(NEW.sales_order_id, OLD.sales_order_id);

  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO v_new_total
  FROM public.sales_order_items
  WHERE sales_order_id = v_order_id;

  UPDATE public.sales_orders
  SET total_amount = v_new_total
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_order_total ON public.sales_order_items;
CREATE TRIGGER trg_recalc_order_total
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items
FOR EACH ROW
EXECUTE FUNCTION public.recalc_order_total();
