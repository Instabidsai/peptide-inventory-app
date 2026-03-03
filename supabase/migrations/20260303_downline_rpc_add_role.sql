-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260303_downline_rpc_add_role.sql
-- Date: 2026-03-03
-- Purpose: Add `role` and `commission_rate` to get_partner_downline return so
--          the frontend can distinguish clients from sales_reps in the tree.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_partner_downline(root_id uuid)
 RETURNS TABLE(id uuid, full_name text, email text, partner_tier text, commission_rate numeric, role text, total_sales numeric, depth integer, path uuid[], parent_rep_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    resolved_profile_id uuid;
    v_org_id uuid;
BEGIN
    -- Resolve auth user_id to profiles.id (the hook passes user?.id which is auth user_id)
    SELECT p.id, p.org_id INTO resolved_profile_id, v_org_id
    FROM profiles p
    WHERE p.user_id = root_id;

    -- If no profile found, try using root_id directly as profile_id (backwards compat)
    IF resolved_profile_id IS NULL THEN
        SELECT p.org_id INTO v_org_id
        FROM profiles p
        WHERE p.id = root_id;

        resolved_profile_id := root_id;
    END IF;

    -- Safety: if we can't determine org, return empty
    IF v_org_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Base case: direct children (check both parent columns) — CONSTRAINED to same org
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            p.commission_rate,
            p.role,
            p.parent_rep_id,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE (p.parent_partner_id = resolved_profile_id
               OR p.parent_rep_id = resolved_profile_id)
          AND p.org_id = v_org_id

        UNION ALL

        -- Recursive case: children of children — CONSTRAINED to same org
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            p.commission_rate,
            p.role,
            p.parent_rep_id,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON (p.parent_partner_id = d.id OR p.parent_rep_id = d.id)
        WHERE d.depth < 5
          AND NOT (p.id = ANY(d.path))  -- prevent cycles
          AND p.org_id = v_org_id
    ),
    -- Calculate total sales per partner from sales_orders — CONSTRAINED to same org
    partner_sales AS (
        SELECT
            so.rep_id,
            COALESCE(SUM(so.total_amount), 0) as vol
        FROM sales_orders so
        WHERE so.rep_id IN (SELECT dl.id FROM downline dl)
          AND so.status != 'cancelled'
          AND so.org_id = v_org_id
        GROUP BY so.rep_id
    )
    SELECT
        d.id,
        d.full_name,
        d.email,
        d.partner_tier,
        d.commission_rate,
        d.role,
        COALESCE(ps.vol, 0.00)::numeric as total_sales,
        d.depth,
        d.path,
        d.parent_rep_id
    FROM downline d
    LEFT JOIN partner_sales ps ON ps.rep_id = d.id;
END;
$function$;
