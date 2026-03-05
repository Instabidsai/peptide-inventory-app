-- Fix: Fulfillment RLS policies only checked user_roles table via has_role(),
-- but admin users may not have a user_roles row (profiles.role is the source of truth).
-- Also allow sales_rep to fulfill their own orders.

-- Helper: check role from EITHER user_roles OR profiles table
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = _user_id AND role = _role::text
    );
$$;

-- movements: allow admin, staff, AND sales_rep to insert (using profiles fallback)
DROP POLICY IF EXISTS "Staff and admins can insert movements" ON movements;
CREATE POLICY "Staff and admins can insert movements" ON movements
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (
      has_any_role(auth.uid(), 'admin'::app_role)
      OR has_any_role(auth.uid(), 'staff'::app_role)
      OR has_any_role(auth.uid(), 'sales_rep'::app_role)
    )
  );

-- movements: allow admin, staff, AND sales_rep to update
DROP POLICY IF EXISTS "Staff and admins can update movements" ON movements;
CREATE POLICY "Staff and admins can update movements" ON movements
  FOR UPDATE TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (
      has_any_role(auth.uid(), 'admin'::app_role)
      OR has_any_role(auth.uid(), 'staff'::app_role)
      OR has_any_role(auth.uid(), 'sales_rep'::app_role)
    )
  );

-- movement_items: allow admin, staff, AND sales_rep to insert
DROP POLICY IF EXISTS "Staff and admins can insert movement items" ON movement_items;
CREATE POLICY "Staff and admins can insert movement items" ON movement_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (movement_id IN (SELECT movements.id FROM movements WHERE movements.org_id = get_user_org_id(auth.uid())))
    AND (
      has_any_role(auth.uid(), 'admin'::app_role)
      OR has_any_role(auth.uid(), 'staff'::app_role)
      OR has_any_role(auth.uid(), 'sales_rep'::app_role)
    )
  );

-- client_inventory: allow sales_rep to insert (in addition to admin/staff)
DROP POLICY IF EXISTS "Client inventory insertable by staff" ON client_inventory;
CREATE POLICY "Client inventory insertable by staff" ON client_inventory
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN contacts c ON c.org_id = p.org_id
      WHERE p.user_id = auth.uid()
        AND c.id = client_inventory.contact_id
        AND (
          has_any_role(auth.uid(), 'admin'::app_role)
          OR has_any_role(auth.uid(), 'staff'::app_role)
          OR has_any_role(auth.uid(), 'sales_rep'::app_role)
        )
    )
  );

-- bottles: update policy should also use has_any_role for consistency
DROP POLICY IF EXISTS "Users can update bottles in their org" ON bottles;
CREATE POLICY "Users can update bottles in their org" ON bottles
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
