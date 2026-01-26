
-- Fix client_inventory RLS to allow Admins/Staff to manage it
-- This is necessary so that inventory assigned by staff appears in the client's fridge.

-- 1. DROP old policies if they exist (using the names from regimen_migration.sql)
DROP POLICY IF EXISTS "Users can view own inventory" ON public.client_inventory;
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.client_inventory;
DROP POLICY IF EXISTS "Users can update own inventory" ON public.client_inventory;
DROP POLICY IF EXISTS "Users can delete own inventory" ON public.client_inventory;

-- 2. CREATE new unified policies

-- SELECT: Client can see own, Admins/Staff can see all in their org
CREATE POLICY "Client inventory viewable by owners and staff"
ON public.client_inventory
FOR SELECT
USING (
  -- Option A: It's the client themselves
  contact_id IN (SELECT id FROM public.contacts WHERE linked_user_id = auth.uid())
  OR
  -- Option B: It's a staff member in the same organization as the contact
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.contacts c ON c.org_id = p.org_id
    WHERE p.user_id = auth.uid()
    AND c.id = public.client_inventory.contact_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  )
);

-- INSERT: Admins/Staff can insert for any contact in their org
CREATE POLICY "Client inventory insertable by staff"
ON public.client_inventory
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.contacts c ON c.org_id = p.org_id
    WHERE p.user_id = auth.uid()
    AND c.id = public.client_inventory.contact_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  )
);

-- UPDATE: Admins/Staff can update
CREATE POLICY "Client inventory updatable by staff"
ON public.client_inventory
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.contacts c ON c.org_id = p.org_id
    WHERE p.user_id = auth.uid()
    AND c.id = public.client_inventory.contact_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  )
);

-- DELETE: Admins focus
CREATE POLICY "Client inventory deletable by staff"
ON public.client_inventory
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.contacts c ON c.org_id = p.org_id
    WHERE p.user_id = auth.uid()
    AND c.id = public.client_inventory.contact_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  )
);
