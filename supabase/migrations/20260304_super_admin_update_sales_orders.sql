-- Super admins can UPDATE and DELETE sales_orders across all orgs.
-- Matches the existing super_admin SELECT policy pattern.

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
