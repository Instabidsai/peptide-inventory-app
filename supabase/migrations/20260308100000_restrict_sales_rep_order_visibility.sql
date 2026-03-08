-- Fix: sales_rep (partner) users could see ALL orders in their org.
-- RLS SELECT on sales_orders only checked org_id, no role filtering.
-- This migration restricts sales_rep to only see their own orders + downline orders.
-- All other roles (admin, staff, super_admin, fulfillment, viewer, customer) are unaffected.

-- Drop the permissive SELECT policy
DROP POLICY IF EXISTS "Users can view sales orders in their org" ON sales_orders;

-- Recreate with sales_rep restriction
-- Logic: if you're NOT a sales_rep → see all (current behavior preserved)
--        if you ARE a sales_rep but ALSO admin/staff → see all (safety override)
--        if you ARE a pure sales_rep → own orders + downline only
CREATE POLICY "Users can view sales orders in their org"
ON sales_orders FOR SELECT
TO authenticated
USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
        -- Non-sales_rep roles: see all orders in their org (preserves current behavior)
        NOT public.has_any_role(auth.uid(), 'sales_rep'::app_role)
        -- Safety: admin/staff always see all, even if also tagged sales_rep
        OR public.has_any_role(auth.uid(), 'admin'::app_role)
        OR public.has_any_role(auth.uid(), 'staff'::app_role)
        -- Sales rep: own orders
        OR rep_id = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
        -- Sales rep: downline orders
        OR rep_id IN (SELECT d.id FROM public.get_partner_downline(auth.uid()) d)
    )
);
