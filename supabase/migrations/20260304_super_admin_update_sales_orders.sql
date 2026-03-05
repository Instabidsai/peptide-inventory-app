-- Fix: sales_reps couldn't update orders (only admin/staff had UPDATE permission).
-- Also: super_admins could see all orders but couldn't update them.

-- 1. Expand UPDATE policy: admin, staff, AND sales_rep (own orders only)
DROP POLICY IF EXISTS "Staff and admins can update sales orders" ON public.sales_orders;
CREATE POLICY "Staff and admins can update sales orders"
  ON public.sales_orders FOR UPDATE
  TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'staff'::app_role)
      OR (
        has_role(auth.uid(), 'sales_rep'::app_role)
        AND rep_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      )
    )
  );

-- 2. Super admin cross-org UPDATE + DELETE
DROP POLICY IF EXISTS super_admin_update_all_sales_orders ON public.sales_orders;
CREATE POLICY super_admin_update_all_sales_orders
  ON public.sales_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS super_admin_delete_all_sales_orders ON public.sales_orders;
CREATE POLICY super_admin_delete_all_sales_orders
  ON public.sales_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
