-- SECURITY DEFINER function to update sales_orders, bypassing RLS.
-- Permission is validated inside the function (same logic as RLS policies).
-- This eliminates PostgREST schema-cache timing issues with RLS policy changes.

CREATE OR REPLACE FUNCTION public.update_sales_order(
  p_order_id UUID,
  p_updates  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_caller_profile RECORD;
  v_order RECORD;
  v_is_super BOOLEAN;
  v_set_clause TEXT := '';
  v_key TEXT;
  v_val JSONB;
  -- Allowed columns (whitelist — prevents injection)
  v_allowed TEXT[] := ARRAY[
    'status','shipping_status','payment_status','payment_method',
    'commission_amount','delivery_method','tracking_number',
    'shipping_carrier','cogs','profit','amount_paid','payment_date',
    'total_amount','notes','merchant_fee','merchant_fee_pct',
    'shipping_cost','discount_amount','discount_code','rep_id',
    'client_id','fulfillment_center_id',
    'cogs_amount','merchant_fee','profit_amount','merchant_fee_pct',
    'cogs','profit'
  ];
BEGIN
  -- 1. Get caller's profile
  SELECT id, org_id, role INTO v_caller_profile
  FROM profiles WHERE user_id = v_caller_uid LIMIT 1;

  IF v_caller_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  -- 2. Check super_admin status (from user_roles)
  SELECT EXISTS(
    SELECT 1 FROM user_roles WHERE user_id = v_caller_uid AND role = 'super_admin'
  ) INTO v_is_super;

  -- 3. Get the order
  SELECT * INTO v_order FROM sales_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 4. Permission check
  IF NOT v_is_super THEN
    -- Must be same org
    IF v_caller_profile.org_id IS DISTINCT FROM v_order.org_id THEN
      RAISE EXCEPTION 'You do not have permission to update this order (org mismatch)';
    END IF;

    -- Must be admin, staff, sales_rep, vendor, or fulfillment
    IF v_caller_profile.role NOT IN ('admin', 'staff', 'sales_rep', 'vendor', 'fulfillment') THEN
      RAISE EXCEPTION 'You do not have permission to update this order (role: %)', v_caller_profile.role;
    END IF;

    -- sales_rep can only update own orders
    IF v_caller_profile.role = 'sales_rep' AND v_order.rep_id IS DISTINCT FROM v_caller_profile.id THEN
      RAISE EXCEPTION 'Sales reps can only update their own orders';
    END IF;
  END IF;

  -- 5. Build dynamic UPDATE from JSONB (only whitelisted columns)
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_updates)
  LOOP
    IF v_key = ANY(v_allowed) THEN
      IF v_set_clause != '' THEN
        v_set_clause := v_set_clause || ', ';
      END IF;

      -- Handle null values
      IF v_val IS NULL OR v_val = 'null'::jsonb THEN
        v_set_clause := v_set_clause || format('%I = NULL', v_key);
      -- Handle numeric types
      ELSIF jsonb_typeof(v_val) = 'number' THEN
        v_set_clause := v_set_clause || format('%I = %s', v_key, v_val #>> '{}');
      -- Handle strings (including dates as strings)
      ELSE
        v_set_clause := v_set_clause || format('%I = %L', v_key, v_val #>> '{}');
      END IF;
    END IF;
  END LOOP;

  IF v_set_clause = '' THEN
    RETURN jsonb_build_object('id', p_order_id);
  END IF;

  -- 6. Execute update
  EXECUTE format(
    'UPDATE sales_orders SET %s, updated_at = now() WHERE id = %L',
    v_set_clause, p_order_id
  );

  RETURN jsonb_build_object('id', p_order_id, 'updated', true);
END;
$$;

-- Grant execute to authenticated users (permission checked inside function)
GRANT EXECUTE ON FUNCTION public.update_sales_order(UUID, JSONB) TO authenticated;
