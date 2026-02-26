-- Fix: movement_items table has no DELETE RLS policy.
-- When useDeleteLot / useDeleteBottle tries to delete movement_items via the
-- Supabase client, the DELETE is silently blocked by RLS (0 rows affected).
-- The subsequent bottle delete then fails with HTTP 409 because the FK
-- constraint (ON DELETE RESTRICT) still sees referencing rows.

CREATE POLICY "Staff and admins can delete movement items"
    ON public.movement_items FOR DELETE
    TO authenticated
    USING (
        movement_id IN (
            SELECT id FROM public.movements
            WHERE org_id = public.get_user_org_id(auth.uid())
        )
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
    );
