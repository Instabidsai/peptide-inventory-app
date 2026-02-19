-- ─────────────────────────────────────────────────────────────────────────────
-- FIX #1: Server-side price validation for orders
-- FIX #2: Restrict wholesale lot costs from regular customers
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #1: create_validated_order — single source of truth for client orders
-- Accepts cart items (peptide_id + quantity ONLY), looks up current prices
-- and the caller's pricing tier, calculates correct price server-side.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_validated_order(
  p_items JSONB,                         -- [{"peptide_id": "uuid", "quantity": 1}, ...]
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_method TEXT DEFAULT 'ship'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_profile       RECORD;
  v_contact       RECORD;
  v_rep           RECORD;
  v_order_id      UUID;
  v_total         DECIMAL(10,2) := 0;
  v_commission_rate DECIMAL := 0;
  v_rep_id        UUID;
  v_item          RECORD;
  v_retail        DECIMAL(10,2);
  v_price         DECIMAL(10,2);
  v_avg_cost      DECIMAL(10,2);
  v_pricing_mode  TEXT;
  v_multiplier    DECIMAL;
  v_markup        DECIMAL;
BEGIN
  -- ── Authenticate ──────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- ── Get caller's profile ──────────────────────────────────────────────
  SELECT id, org_id, price_multiplier, pricing_mode, cost_plus_markup, commission_rate
  INTO v_profile
  FROM profiles WHERE user_id = v_user_id;

  IF v_profile IS NULL OR v_profile.org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No organization found');
  END IF;

  -- ── Get caller's contact record ───────────────────────────────────────
  SELECT id, type, assigned_rep_id
  INTO v_contact
  FROM contacts WHERE linked_user_id = v_user_id LIMIT 1;

  -- ── Determine pricing source ──────────────────────────────────────────
  -- Default: use own profile settings
  v_rep_id := v_profile.id;
  v_pricing_mode := COALESCE(v_profile.pricing_mode, 'percentage');
  v_multiplier := CASE
    WHEN COALESCE(v_profile.price_multiplier, 0) > 0 THEN v_profile.price_multiplier
    ELSE 1.0
  END;
  v_markup := COALESCE(v_profile.cost_plus_markup, 0);
  v_commission_rate := COALESCE(v_profile.commission_rate, 0);

  IF v_contact IS NOT NULL THEN
    IF v_contact.type = 'customer' THEN
      -- ── Customer: percentage mode ONLY, using their own discount ──────
      v_pricing_mode := 'percentage';
      -- v_multiplier already set from own profile (customer's discount, e.g. 0.80)
      IF v_contact.assigned_rep_id IS NOT NULL THEN
        v_rep_id := v_contact.assigned_rep_id;
        SELECT commission_rate INTO v_commission_rate
        FROM profiles WHERE id = v_contact.assigned_rep_id;
        v_commission_rate := COALESCE(v_commission_rate, 0.10);
      END IF;

    ELSIF v_contact.assigned_rep_id IS NOT NULL THEN
      -- ── Partner/other with an upline rep ──────────────────────────────
      v_rep_id := v_contact.assigned_rep_id;
      SELECT pricing_mode, price_multiplier, cost_plus_markup, commission_rate
      INTO v_rep
      FROM profiles WHERE id = v_contact.assigned_rep_id;

      IF v_rep IS NOT NULL THEN
        v_pricing_mode := COALESCE(v_rep.pricing_mode, 'percentage');
        v_multiplier := CASE
          WHEN COALESCE(v_rep.price_multiplier, 0) > 0 THEN v_rep.price_multiplier
          ELSE 1.0
        END;
        v_markup := COALESCE(v_rep.cost_plus_markup, 0);
        v_commission_rate := COALESCE(v_rep.commission_rate, 0.10);
      END IF;
    END IF;
    -- Else: partner ordering for themselves → uses own profile settings (already set)
  END IF;

  -- ── Validate items array ──────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items provided');
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many items (max 50)');
  END IF;

  -- ── Create the order shell ────────────────────────────────────────────
  INSERT INTO sales_orders (
    org_id, client_id, rep_id, status,
    total_amount, commission_amount,
    shipping_address, notes, payment_method, delivery_method
  ) VALUES (
    v_profile.org_id,
    v_contact.id,   -- NULL if no contact record
    v_rep_id,
    'draft',
    0, 0,
    p_shipping_address, p_notes, p_payment_method, p_delivery_method
  )
  RETURNING id INTO v_order_id;

  -- ── Calculate and insert each item with server-validated price ────────
  FOR v_item IN
    SELECT x.peptide_id, x.quantity
    FROM jsonb_to_recordset(p_items) AS x(peptide_id UUID, quantity INT)
  LOOP
    -- Validate quantity
    IF v_item.quantity IS NULL OR v_item.quantity < 1 OR v_item.quantity > 100 THEN
      DELETE FROM sales_order_items WHERE sales_order_id = v_order_id;
      DELETE FROM sales_orders WHERE id = v_order_id;
      RETURN jsonb_build_object('success', false, 'error',
        format('Invalid quantity for peptide %s', v_item.peptide_id));
    END IF;

    -- Look up retail price (must be in same org)
    SELECT retail_price INTO v_retail
    FROM peptides
    WHERE id = v_item.peptide_id AND org_id = v_profile.org_id AND active = true;

    IF v_retail IS NULL THEN
      DELETE FROM sales_order_items WHERE sales_order_id = v_order_id;
      DELETE FROM sales_orders WHERE id = v_order_id;
      RETURN jsonb_build_object('success', false, 'error',
        format('Peptide %s not found or inactive', v_item.peptide_id));
    END IF;

    -- Default price = full retail
    v_price := v_retail;

    IF v_pricing_mode IN ('cost_plus', 'cost_multiplier') THEN
      -- Look up average lot cost for this peptide
      SELECT ROUND(AVG(cost_per_unit)::numeric, 2) INTO v_avg_cost
      FROM lots
      WHERE peptide_id = v_item.peptide_id AND cost_per_unit > 0;

      IF v_avg_cost IS NOT NULL AND v_avg_cost > 0 THEN
        IF v_pricing_mode = 'cost_plus' THEN
          v_price := ROUND((v_avg_cost + v_markup)::numeric, 2);
        ELSE -- cost_multiplier
          v_price := ROUND((v_avg_cost * v_markup)::numeric, 2);
        END IF;
      ELSE
        -- No cost data available — fall back to percentage mode
        v_price := ROUND((v_retail * v_multiplier)::numeric, 2);
      END IF;
    ELSE
      -- percentage mode
      v_price := ROUND((v_retail * v_multiplier)::numeric, 2);
    END IF;

    -- Safety: never allow $0 or negative prices
    IF v_price < 0.01 THEN
      v_price := v_retail;
    END IF;

    -- Insert the order item
    INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
    VALUES (v_order_id, v_item.peptide_id, v_item.quantity, v_price);

    v_total := v_total + ROUND((v_item.quantity * v_price)::numeric, 2);
  END LOOP;

  -- ── Update order with validated totals ────────────────────────────────
  UPDATE sales_orders
  SET total_amount = v_total,
      commission_amount = GREATEST(0, ROUND((v_total * v_commission_rate)::numeric, 2))
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total_amount', v_total
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #2: Restrict lot cost visibility — customers must NOT see wholesale costs
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view lots in their org" ON public.lots;

-- New policy: lots visible to org members EXCEPT customers
CREATE POLICY "Lots visible to non-customer org members"
ON public.lots FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE linked_user_id = auth.uid()
      AND type = 'customer'
  )
);

-- NOTE: INSERT/UPDATE/DELETE policies unchanged — they already require org membership
-- and customers wouldn't be inserting/updating lots anyway.
