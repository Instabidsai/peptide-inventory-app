-- Migration: pay_order_with_credit RPC
-- Source: scripts/20260129_pay_with_credit.sql (full definition)
--         scripts/schema-master.sql lines 1673-1702
-- Called from: src/hooks/use-sales-orders.ts line 880
-- Purpose: Atomically deduct store credit from a user's profile balance
--          and mark the sales order as paid. Uses FOR UPDATE to prevent
--          race conditions on the balance check.

CREATE OR REPLACE FUNCTION public.pay_order_with_credit(p_order_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_credit_balance decimal;
  v_order_total decimal;
  v_org_id uuid;
BEGIN
  -- 1. Check User Balance (lock row to prevent race conditions)
  SELECT credit_balance, org_id INTO v_credit_balance, v_org_id
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;

  -- 2. Get Order Total
  SELECT total_amount INTO v_order_total
  FROM public.sales_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- 3. Validate Sufficiency
  IF v_credit_balance < v_order_total THEN
    RAISE EXCEPTION 'Insufficient credit balance (Calculated: %, Needed: %)', v_credit_balance, v_order_total;
  END IF;

  -- 4. Deduct Credit
  UPDATE public.profiles
  SET credit_balance = credit_balance - v_order_total
  WHERE id = p_user_id;

  -- 5. Mark Order Paid
  UPDATE public.sales_orders
  SET
    status = 'submitted',
    payment_status = 'paid',
    amount_paid = v_order_total,
    payment_method = 'store_credit',
    payment_date = now()
  WHERE id = p_order_id;
END;
$$;
