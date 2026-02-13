-- Rewrite commission RPC: revenue-based (rate × sale amount), not margin-based
-- Commission splits into 'available' (paid portion) and 'pending' (unpaid portion)

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
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, ROUND(v_comm_paid, 2), v_rep_rate, 'direct', 'available');
    END IF;

    IF v_comm_unpaid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, ROUND(v_comm_unpaid, 2), v_rep_rate, 'direct', 'pending');
    END IF;

    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate INTO v_parent_rate FROM public.profiles WHERE id = v_parent_rep_id;
        v_parent_rate := COALESCE(v_parent_rate, 0.10);

        v_override_paid := v_amount_paid * v_parent_rate;
        v_override_unpaid := v_amount_unpaid * v_parent_rate;

        IF v_override_paid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
            VALUES (p_sale_id, v_parent_rep_id, ROUND(v_override_paid, 2), v_parent_rate, 'second_tier_override', 'available');
        END IF;

        IF v_override_unpaid > 0 THEN
            INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
            VALUES (p_sale_id, v_parent_rep_id, ROUND(v_override_unpaid, 2), v_parent_rate, 'second_tier_override', 'pending');
        END IF;
    END IF;

    UPDATE public.sales_orders
    SET commission_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    WHERE id = p_sale_id;
END;
$$;

-- Also fix apply_commissions_to_owed to use 'available' (not 'pending')
CREATE OR REPLACE FUNCTION apply_commissions_to_owed(partner_profile_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_applied decimal := 0;
  v_remaining decimal := 0;
  v_movement record;
  v_contact_id uuid;
  v_apply decimal;
  v_movements_paid int := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_remaining
  FROM commissions
  WHERE partner_id = partner_profile_id AND status = 'available';

  IF v_remaining <= 0 THEN
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', 0);
  END IF;

  UPDATE commissions
  SET status = 'paid'
  WHERE partner_id = partner_profile_id AND status = 'available';

  SELECT c.id INTO v_contact_id
  FROM contacts c
  JOIN profiles p ON p.user_id = c.linked_user_id
  WHERE p.id = partner_profile_id
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', v_remaining);
  END IF;

  FOR v_movement IN
    SELECT m.id,
           COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) as owed,
           m.amount_paid
    FROM movements m
    JOIN movement_items mi ON mi.movement_id = m.id
    WHERE m.contact_id = v_contact_id
      AND m.payment_status IN ('unpaid', 'partial')
    GROUP BY m.id, m.discount_amount, m.amount_paid
    HAVING COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) > 0
    ORDER BY m.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_movement.owed);

    UPDATE movements
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        payment_status = CASE
          WHEN COALESCE(amount_paid, 0) + v_apply >= (
            SELECT COALESCE(SUM(mi2.price_at_sale), 0) FROM movement_items mi2 WHERE mi2.movement_id = movements.id
          ) - COALESCE(discount_amount, 0) THEN 'paid'
          ELSE 'partial'
        END,
        notes = COALESCE(notes, '') || E'\nCommission applied: $' || v_apply::text || ' on ' || NOW()::date::text
    WHERE id = v_movement.id;

    v_remaining := v_remaining - v_apply;
    v_total_applied := v_total_applied + v_apply;
    v_movements_paid := v_movements_paid + 1;
  END LOOP;

  IF v_remaining > 0 THEN
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
  END IF;

  RETURN json_build_object(
    'applied', v_total_applied,
    'movements_paid', v_movements_paid,
    'remaining_credit', v_remaining
  );
END;
$$;
