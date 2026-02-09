-- Create RPC function to count in-stock bottles per peptide
-- This avoids client-side pagination limits (1000 rows) and is faster.

CREATE OR REPLACE FUNCTION public.get_peptide_stock_counts()
RETURNS TABLE (
    peptide_id UUID,
    stock_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.peptide_id,
        COUNT(b.id) as stock_count
    FROM 
        public.bottles b
    JOIN 
        public.lots l ON b.lot_id = l.id
    WHERE 
        b.status = 'in_stock'
        AND b.org_id = public.get_user_org_id(auth.uid()) -- Respected RLS
    GROUP BY 
        l.peptide_id;
END;
$$;
