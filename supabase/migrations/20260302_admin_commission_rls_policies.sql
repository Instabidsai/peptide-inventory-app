-- Fix: Admins couldn't insert or delete commission records due to missing RLS policies.
-- Only super_admin had INSERT/DELETE. This caused the manual commission chain insert
-- in NewOrder.tsx to silently fail, leaving orders with $0 commission records.

CREATE POLICY "Admins insert org commissions"
ON public.commissions
FOR INSERT
WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins delete org commissions"
ON public.commissions
FOR DELETE
USING (
    org_id = get_user_org_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
);
