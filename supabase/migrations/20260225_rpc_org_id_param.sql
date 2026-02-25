-- Fix RPCs for impersonation: accept optional p_org_id parameter
-- When super_admin provides p_org_id, use it; otherwise fall back to get_user_org_id(auth.uid())

-- Drop old 0-arg overloads so PostgREST doesn't pick the wrong one
DROP FUNCTION IF EXISTS public.get_bottle_stats();
DROP FUNCTION IF EXISTS public.get_inventory_valuation();
DROP FUNCTION IF EXISTS public.get_peptide_stock_counts();

-- 1. get_bottle_stats — used by dashboard bottle stats widget
CREATE OR REPLACE FUNCTION public.get_bottle_stats(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (status text, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    effective_org_id UUID;
BEGIN
    IF p_org_id IS NOT NULL AND public.is_super_admin() THEN
        effective_org_id := p_org_id;
    ELSE
        effective_org_id := public.get_user_org_id(auth.uid());
    END IF;

    RETURN QUERY
    SELECT b.status::text, COUNT(*) as count
    FROM public.bottles b
    WHERE b.org_id = effective_org_id
    GROUP BY b.status;
END;
$$;

-- 2. get_inventory_valuation — used by dashboard financial metrics
CREATE OR REPLACE FUNCTION public.get_inventory_valuation(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (total_value NUMERIC, item_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    effective_org_id UUID;
BEGIN
    IF p_org_id IS NOT NULL AND public.is_super_admin() THEN
        effective_org_id := p_org_id;
    ELSE
        effective_org_id := public.get_user_org_id(auth.uid());
    END IF;

    RETURN QUERY
    SELECT COALESCE(SUM(l.cost_per_unit), 0) as total_value,
           COUNT(b.id) as item_count
    FROM public.bottles b
    JOIN public.lots l ON b.lot_id = l.id
    WHERE b.status = 'in_stock'
      AND b.org_id = effective_org_id;
END;
$$;

-- 3. get_peptide_stock_counts — used by peptides page stock display
CREATE OR REPLACE FUNCTION public.get_peptide_stock_counts(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (peptide_id UUID, stock_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    effective_org_id UUID;
BEGIN
    IF p_org_id IS NOT NULL AND public.is_super_admin() THEN
        effective_org_id := p_org_id;
    ELSE
        effective_org_id := public.get_user_org_id(auth.uid());
    END IF;

    RETURN QUERY
    SELECT l.peptide_id, COUNT(b.id) as stock_count
    FROM public.bottles b
    JOIN public.lots l ON b.lot_id = l.id
    WHERE b.status = 'in_stock'
      AND b.org_id = effective_org_id
    GROUP BY l.peptide_id;
END;
$$;
