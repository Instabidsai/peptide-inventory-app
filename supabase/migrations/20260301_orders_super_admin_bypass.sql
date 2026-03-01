-- Super admin bypass for orders table
-- Previously orders_org_isolation only allowed users to see their own org's orders.
-- Super admins need to see ALL orders across all orgs (for the main admin panel).
-- During impersonation, AuthContext swaps profile.org_id at the React level,
-- but auth.uid() still resolves to the real user at the DB level — so RLS must
-- explicitly allow super_admin to bypass the org filter.

DROP POLICY IF EXISTS orders_org_isolation ON public.orders;

CREATE POLICY orders_org_isolation ON public.orders
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'super_admin')
  );
