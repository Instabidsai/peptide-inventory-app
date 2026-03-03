-- recalculate_sale_commission: Deletes existing commission records for an order
-- and re-runs the full chain calculation from scratch.
-- Use case: when the rep hierarchy was fixed AFTER the order was created,
-- or when manual_commissions bypassed the RPC and missed tiers.

CREATE OR REPLACE FUNCTION recalculate_sale_commission(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_deleted_count int;
    v_has_paid boolean;
BEGIN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Safety: don't recalc if any commission is already paid out
    SELECT EXISTS(
        SELECT 1 FROM public.commissions
        WHERE sale_id = p_sale_id AND status = 'paid'
    ) INTO v_has_paid;

    IF v_has_paid THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot recalculate — one or more commissions are already paid out. Void them first if needed.'
        );
    END IF;

    -- Delete all existing commission records for this order
    DELETE FROM public.commissions WHERE sale_id = p_sale_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Re-run the standard commission chain (process_sale_commission checks
    -- for existing records, so after the delete it will create fresh ones)
    PERFORM process_sale_commission(p_sale_id);

    -- Count new records
    RETURN jsonb_build_object(
        'success', true,
        'deleted', v_deleted_count,
        'created', (SELECT count(*) FROM public.commissions WHERE sale_id = p_sale_id),
        'new_total', (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    );
END;
$$;
