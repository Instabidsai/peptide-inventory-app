-- Fix get_partner_downline: resolve user_id→profile_id, check both parent columns, include real sales totals
CREATE OR REPLACE FUNCTION public.get_partner_downline(root_id uuid)
 RETURNS TABLE(id uuid, full_name text, email text, partner_tier text, total_sales numeric, depth integer, path uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    resolved_profile_id uuid;
BEGIN
    -- Resolve auth user_id to profiles.id (the hook passes user?.id which is auth user_id)
    SELECT p.id INTO resolved_profile_id
    FROM profiles p
    WHERE p.user_id = root_id;

    -- If no profile found, try using root_id directly as profile_id (backwards compat)
    IF resolved_profile_id IS NULL THEN
        resolved_profile_id := root_id;
    END IF;

    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Base case: direct children (check both parent columns)
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE p.parent_partner_id = resolved_profile_id
           OR p.parent_rep_id = resolved_profile_id

        UNION ALL

        -- Recursive case: children of children
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON (p.parent_partner_id = d.id OR p.parent_rep_id = d.id)
        WHERE d.depth < 5
          AND NOT (p.id = ANY(d.path))  -- prevent cycles
    ),
    -- Calculate total sales per partner from sales_orders
    partner_sales AS (
        SELECT
            so.rep_id,
            COALESCE(SUM(so.total_amount), 0) as vol
        FROM sales_orders so
        WHERE so.rep_id IN (SELECT dl.id FROM downline dl)
          AND so.status != 'cancelled'
        GROUP BY so.rep_id
    )
    SELECT
        d.id,
        d.full_name,
        d.email,
        d.partner_tier,
        COALESCE(ps.vol, 0.00)::numeric as total_sales,
        d.depth,
        d.path
    FROM downline d
    LEFT JOIN partner_sales ps ON ps.rep_id = d.id;
END;
$function$;
