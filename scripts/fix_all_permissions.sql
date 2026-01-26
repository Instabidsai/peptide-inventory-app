-- FIX: Enable ALL Permissions for Staff (Deletes, Updates)
-- Run this in Supabase SQL Editor

-- 1. Unblock Sales Order Deletion (Recursive/Cascade)
ALTER TABLE public.sales_order_items
DROP CONSTRAINT IF EXISTS sales_order_items_sales_order_id_fkey;

ALTER TABLE public.sales_order_items
ADD CONSTRAINT sales_order_items_sales_order_id_fkey
FOREIGN KEY (sales_order_id)
REFERENCES public.sales_orders(id)
ON DELETE CASCADE;

-- 2. Grant Delete/Update Permissions on Sales Orders & Items
DROP POLICY IF EXISTS "Authenticated Staff Delete Orders" ON public.sales_orders;
CREATE POLICY "Authenticated Staff Delete Orders" ON public.sales_orders FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Staff Delete Order Items" ON public.sales_order_items;
CREATE POLICY "Authenticated Staff Delete Order Items" ON public.sales_order_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Staff Update Orders" ON public.sales_orders;
CREATE POLICY "Authenticated Staff Update Orders" ON public.sales_orders FOR UPDATE TO authenticated USING (true);

-- 3. Grant Permissions on Movements (For "Mark as Paid" and correcting inventory)
DROP POLICY IF EXISTS "Authenticated Staff Delete Movements" ON public.movements;
CREATE POLICY "Authenticated Staff Delete Movements" ON public.movements FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Staff Update Movements" ON public.movements;
CREATE POLICY "Authenticated Staff Update Movements" ON public.movements FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Staff Delete Movement Items" ON public.movement_items;
CREATE POLICY "Authenticated Staff Delete Movement Items" ON public.movement_items FOR DELETE TO authenticated USING (true);
