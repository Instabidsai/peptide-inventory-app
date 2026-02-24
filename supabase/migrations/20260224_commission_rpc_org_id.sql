-- Update process_sale_commission to populate org_id on new commission rows.
-- This ensures new commissions get org_id from the parent sales_order.

CREATE OR REPLACE FUNCTION process_sale_commission(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order record;
    v_rep_id uuid;
    v_parent_rep_id uuid;
    v_rep_rate numeric;
    v_parent_rate numeric;
    v_net_sale numeric;
    v_amount_paid numeric;
    v_amount_unpaid numeric;
    v_comm_paid numeric;
    v_comm_unpaid numeric;
    v_override_paid numeric;
    v_override_unpaid numeric;
BEGIN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    IF EXISTS (SELECT 1 FROM public.commissions WHERE sale_id = p_sale_id) THEN
        RETURN;
    END IF;

    v_rep_id := v_order.rep_id;

    IF v_rep_id IS NULL THEN
        SELECT id, parent_rep_id, commission_rate INTO v_rep_id, v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_order.client_id AND role IN ('sales_rep', 'admin', 'staff');
    ELSE
        SELECT parent_rep_id, commission_rate INTO v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_rep_id;
    END IF;

    IF v_rep_id IS NULL THEN RETURN; END IF;

    v_net_sale := COALESCE(v_order.total_amount, 0);

    DECLARE
        v_discount numeric := 0;
    BEGIN
        SELECT COALESCE(m.discount_amount, 0) INTO v_discount
        FROM public.movements m
        WHERE m.notes LIKE '%' || LEFT(p_sale_id::text, 8) || '%'
        LIMIT 1;
        v_net_sale := v_net_sale - v_discount;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    v_amount_paid := LEAST(COALESCE(v_order.amount_paid, 0), v_net_sale);
    v_amount_unpaid := GREATEST(v_net_sale - v_amount_paid, 0);

    v_rep_rate := COALESCE(v_rep_rate, 0.10);

    v_comm_paid := v_amount_paid * v_rep_rate;
    v_comm_unpaid := v_amount_unpaid * v_rep_rate;

    IF v_comm_paid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
        VALUES (p_sale_id, v_rep_id, ROUND(v_comm_paid, 2), v_rep_rate, 'direct', 'available', v_order.org_id);
    END IF;

    IF v_comm_unpaid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
        VALUES (p_sale_id, v_rep_id, ROUND(v_comm_unpaid, 2), v_rep_rate, 'direct', 'pending', v_order.org_id);
    END IF;

    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate INTO v_parent_rate FROM public.profiles WHERE id = v_parent_rep_id;
        v_parent_rate := COALESCE(v_parent_rate, 0.10);

        v_override_paid := v_amount_paid * v_parent_rate;
        v_override_unpaid := v_amount_unpaid * v_parent_rate;

        IF v_override_paid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
            VALUES (p_sale_id, v_parent_rep_id, ROUND(v_override_paid, 2), v_parent_rate, 'second_tier_override', 'available', v_order.org_id);
        END IF;

        IF v_override_unpaid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
            VALUES (p_sale_id, v_parent_rep_id, ROUND(v_override_unpaid, 2), v_parent_rate, 'second_tier_override', 'pending', v_order.org_id);
        END IF;
    END IF;

    UPDATE public.sales_orders
    SET commission_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    WHERE id = p_sale_id;
END;
$$;
