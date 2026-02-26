-- Migration: get_supplier_orders RPC
-- Source: scripts/20260223_business_in_a_box.sql lines 133-164
-- Called from: src/pages/vendor/VendorSupplyOrders.tsx line 70
-- Purpose: Return all supplier orders for a given supplier org, by finding
--          merchant orgs whose tenant_config.supplier_org_id matches the
--          supplied parameter. Used on the vendor dashboard to view incoming
--          orders from downstream merchants.

CREATE OR REPLACE FUNCTION public.get_supplier_orders(p_supplier_org_id UUID)
 RETURNS TABLE (
   order_id UUID,
   merchant_org_id UUID,
   merchant_name TEXT,
   order_date TIMESTAMPTZ,
   status TEXT,
   payment_status TEXT,
   total_amount NUMERIC,
   item_count BIGINT
 )
 LANGUAGE sql
 SECURITY DEFINER
AS $$
  SELECT
    so.id,
    so.org_id,
    o.name,
    so.created_at,
    so.status,
    so.payment_status,
    so.total_amount,
    count(soi.id)
  FROM sales_orders so
  JOIN organizations o ON o.id = so.org_id
  LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
  WHERE so.is_supplier_order = true
    AND EXISTS (
        SELECT 1 FROM tenant_config tc
        WHERE tc.org_id = so.org_id
        AND tc.supplier_org_id = p_supplier_org_id
    )
  GROUP BY so.id, so.org_id, o.name, so.created_at, so.status, so.payment_status, so.total_amount
  ORDER BY so.created_at DESC;
$$;
