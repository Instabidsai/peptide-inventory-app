
-- 1. Create RPC to get total inventory value (Cost Basis)
-- This avoids client-side pagination limits and is much faster.

CREATE OR REPLACE FUNCTION public.get_inventory_valuation()
RETURNS TABLE (
    total_value NUMERIC,
    item_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(l.cost_per_unit), 0) as total_value,
        COUNT(b.id) as item_count
    FROM 
        public.bottles b
    JOIN 
        public.lots l ON b.lot_id = l.id
    WHERE 
        b.status = 'in_stock'
        AND b.org_id = public.get_user_org_id(auth.uid());
END;
$$;
