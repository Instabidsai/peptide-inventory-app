-- Fix: process_sale_commission early-returns when direct rep has commission_rate=0,
-- killing the ENTIRE parent/grandparent chain. Instead, skip the direct rep's
-- commission but still walk the chain so parents get their override commissions.
--
-- Example: Sonia (rate=0) → Danny (rate=0.1) → Don (rate=0.1)
-- Before: RPC exits at line 325, Danny and Don get nothing.
-- After: Sonia gets $0 (correct), Danny gets 10%, Don gets 10%.

CREATE OR REPLACE FUNCTION process_sale_commission(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_rep_id uuid;
    v_parent_rep_id uuid;
    v_grandparent_rep_id uuid;
    v_rep_rate numeric;
    v_parent_rate numeric;
    v_grandparent_rate numeric;
    v_net_sale numeric;
    v_amount_paid numeric;
    v_amount_unpaid numeric;
    v_comm_paid numeric;
    v_comm_unpaid numeric;
    v_override_paid numeric;
    v_override_unpaid numeric;
    v_gp_override_paid numeric;
    v_gp_override_unpaid numeric;
BEGIN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Idempotent: skip if commissions already exist for this order
    IF EXISTS (SELECT 1 FROM public.commissions WHERE sale_id = p_sale_id) THEN
        RETURN;
    END IF;

    -- Skip partner/commission_offset orders — no commissions on these
    IF v_order.payment_status = 'commission_offset' THEN
        RETURN;
    END IF;

    v_rep_id := v_order.rep_id;

    -- If no rep on the order, try to find one from the client's profile
    IF v_rep_id IS NULL THEN
        SELECT id, parent_rep_id, commission_rate INTO v_rep_id, v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_order.client_id AND role IN ('sales_rep', 'admin', 'staff');
    ELSE
        SELECT parent_rep_id, commission_rate INTO v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_rep_id;
    END IF;

    -- No rep at all — nothing to do
    IF v_rep_id IS NULL THEN
        RETURN;
    END IF;

    -- Default rate to 0 if null (rep exists but has no rate set)
    v_rep_rate := COALESCE(v_rep_rate, 0);

    -- Calculate net sale (after discounts) and payment split
    v_net_sale := COALESCE(v_order.total_amount, 0);

    DECLARE
        v_discount numeric := 0;
    BEGIN
        SELECT COALESCE(m.discount_amount, 0) INTO v_discount
        FROM public.movements m
        WHERE m.notes LIKE '%' || LEFT(p_sale_id::text, 8) || '%'
        LIMIT 1;
        v_net_sale := v_net_sale - COALESCE(v_discount, 0);
    EXCEPTION WHEN OTHERS THEN
        NULL; -- No linked movement, that's fine
    END;

    v_amount_paid := LEAST(COALESCE(v_order.amount_paid, 0), v_net_sale);
    v_amount_unpaid := GREATEST(v_net_sale - v_amount_paid, 0);

    -- ── TIER 1: Direct rep commission (only if rate > 0) ─────────────────
    IF v_rep_rate > 0 THEN
        v_comm_paid := ROUND(v_amount_paid * v_rep_rate, 2);
        v_comm_unpaid := ROUND(v_amount_unpaid * v_rep_rate, 2);

        IF v_comm_paid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
            VALUES (p_sale_id, v_rep_id, v_comm_paid, v_rep_rate, 'direct', 'available', v_order.org_id);
        END IF;
        IF v_comm_unpaid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
            VALUES (p_sale_id, v_rep_id, v_comm_unpaid, v_rep_rate, 'direct', 'pending', v_order.org_id);
        END IF;
    END IF;

    -- ── TIER 2: Parent override (ALWAYS check, even if direct rep rate was 0) ─
    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate, parent_rep_id INTO v_parent_rate, v_grandparent_rep_id
        FROM public.profiles
        WHERE id = v_parent_rep_id;

        IF v_parent_rate IS NOT NULL AND v_parent_rate > 0 THEN
            v_override_paid := ROUND(v_amount_paid * v_parent_rate, 2);
            v_override_unpaid := ROUND(v_amount_unpaid * v_parent_rate, 2);

            IF v_override_paid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                VALUES (p_sale_id, v_parent_rep_id, v_override_paid, v_parent_rate, 'second_tier_override', 'available', v_order.org_id);
            END IF;
            IF v_override_unpaid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                VALUES (p_sale_id, v_parent_rep_id, v_override_unpaid, v_parent_rate, 'second_tier_override', 'pending', v_order.org_id);
            END IF;
        END IF;

        -- ── TIER 3: Grandparent override ───────────────────────────────────
        IF v_grandparent_rep_id IS NOT NULL THEN
            SELECT commission_rate INTO v_grandparent_rate
            FROM public.profiles
            WHERE id = v_grandparent_rep_id;

            IF v_grandparent_rate IS NOT NULL AND v_grandparent_rate > 0 THEN
                v_gp_override_paid := ROUND(v_amount_paid * v_grandparent_rate, 2);
                v_gp_override_unpaid := ROUND(v_amount_unpaid * v_grandparent_rate, 2);

                IF v_gp_override_paid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_paid, v_grandparent_rate, 'third_tier_override', 'available', v_order.org_id);
                END IF;
                IF v_gp_override_unpaid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_unpaid, v_grandparent_rate, 'third_tier_override', 'pending', v_order.org_id);
                END IF;
            END IF;
        END IF;
    END IF;

    -- Update order's commission_amount total
    UPDATE public.sales_orders
    SET commission_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    WHERE id = p_sale_id;
END;
$$;
