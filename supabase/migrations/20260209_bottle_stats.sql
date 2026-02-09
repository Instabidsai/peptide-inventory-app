
-- Create RPC to get bottle counts by status
-- Bypasses 1000-row limit for Dashboard stats.

CREATE OR REPLACE FUNCTION public.get_bottle_stats()
RETURNS TABLE (
    status text,
    count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.status::text,
        COUNT(*) as count
    FROM 
        public.bottles b
    WHERE 
        b.org_id = public.get_user_org_id(auth.uid())
    GROUP BY 
        b.status;
END;
$$;
