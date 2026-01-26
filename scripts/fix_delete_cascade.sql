-- FIX: Enable Cascading Delete for Sales Orders
-- Run this in Supabase SQL Editor to fix the "Delete" button not working

-- 1. Drop the strict constraint that prevents deletion
ALTER TABLE public.sales_order_items
DROP CONSTRAINT IF EXISTS sales_order_items_sales_order_id_fkey;

-- 2. Add a new constraint that allows "Cascade" (delete items when order is deleted)
ALTER TABLE public.sales_order_items
ADD CONSTRAINT sales_order_items_sales_order_id_fkey
FOREIGN KEY (sales_order_id)
REFERENCES public.sales_orders(id)
ON DELETE CASCADE;

-- 3. Ensure permissions are set correctly for Orders
DROP POLICY IF EXISTS "Authenticated Users Can Delete Orders" ON public.sales_orders;
CREATE POLICY "Authenticated Users Can Delete Orders" ON public.sales_orders FOR DELETE TO authenticated USING (true);

-- 4. Enable Delete on Items too (Critical for cascading)
DROP POLICY IF EXISTS "Authenticated Users Can Delete Order Items" ON public.sales_order_items;
CREATE POLICY "Authenticated Users Can Delete Order Items" ON public.sales_order_items FOR DELETE TO authenticated USING (true);

-- 5. Ensure SELECT permissions exist (sometimes needed to verify the row before delete)
DROP POLICY IF EXISTS "Authenticated Users Can Select Orders" ON public.sales_orders;
CREATE POLICY "Authenticated Users Can Select Orders" ON public.sales_orders FOR SELECT TO authenticated USING (true);
