-- Fix: Partner self-orders should NEVER have commission.
-- Commission only applies at MSRP/retail pricing.
-- This RPC is called from PartnerStore for partner self-orders,
-- which are always at wholesale pricing (cost_plus or multiplier).
-- Force commission_rate = 0 for all partner self-orders.

CREATE OR REPLACE FUNCTION public.create_validated_order(
  p_items JSONB,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_delivery_method TEXT DEFAULT 'ship',
  p_contact_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_contact RECORD;
  v_rep RECORD;
  v_rep_id UUID;
  v_pricing_mode TEXT;
  v_multiplier NUMERIC;
  v_markup NUMERIC;
  v_commission_rate NUMERIC;
  v_item JSONB;
  v_peptide RECORD;
  v_unit_price NUMERIC;
  v_total NUMERIC := 0;
  v_items_out JSONB := '[]'::jsonb;
  v_order_id UUID;
  v_org_id UUID;
BEGIN
  -- ── Auth ─────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id, pricing_mode, price_multiplier, cost_plus_markup, commission_rate, org_id
  INTO v_profile
  FROM profiles
  WHERE user_id = v_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_org_id := v_profile.org_id;

  -- ── Resolve contact ─────────────────────────────────────────────────────
  IF p_contact_id IS NOT NULL THEN
    SELECT id, type, assigned_rep_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_org_id;
  END IF;

  -- ── Determine pricing source ──────────────────────────────────────────
  v_rep_id := v_profile.id;
  v_pricing_mode := COALESCE(v_profile.pricing_mode, 'percentage');
  v_multiplier := CASE
    WHEN COALESCE(v_profile.price_multiplier, 0) > 0 THEN v_profile.price_multiplier
    ELSE 1.0
  END;
  v_markup := COALESCE(v_profile.cost_plus_markup, 0);

  -- Partner self-orders: ALWAYS $0 commission (wholesale pricing, not MSRP)
  -- The partner's commission_rate is what they earn when SELLING, not when BUYING.
  v_commission_rate := 0;

  IF v_contact IS NOT NULL THEN
    IF v_contact.type = 'customer' THEN
      v_pricing_mode := 'percentage';
      IF v_contact.assigned_rep_id IS NOT NULL THEN
        v_rep_id := v_contact.assigned_rep_id;
        SELECT commission_rate INTO v_commission_rate
        FROM profiles WHERE id = v_contact.assigned_rep_id;
        v_commission_rate := COALESCE(v_commission_rate, 0.10);
      END IF;

    ELSIF v_contact.assigned_rep_id IS NOT NULL THEN
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
    -- Else: partner ordering for themselves → commission stays 0 (set above)
  END IF;

  -- ── Validate items array ──────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items provided');
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many items');
  END IF;

  -- ── Calculate prices ──────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, avg_cost, retail_price, active
    INTO v_peptide
    FROM peptides
    WHERE id = (v_item->>'peptide_id')::UUID;

    IF v_peptide IS NULL OR NOT v_peptide.active THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Peptide not found or inactive: ' || (v_item->>'peptide_id'));
    END IF;

    IF v_pricing_mode = 'cost_plus' THEN
      v_unit_price := ROUND((COALESCE(v_peptide.avg_cost, 0) + v_markup)::numeric, 2);
    ELSE
      v_unit_price := ROUND((COALESCE(v_peptide.avg_cost, 0) * v_multiplier)::numeric, 2);
    END IF;

    -- Sanity: never sell below $0.01
    IF v_unit_price < 0.01 THEN
      v_unit_price := COALESCE(v_peptide.retail_price, 1.00);
    END IF;

    v_total := v_total + v_unit_price * COALESCE((v_item->>'quantity')::int, 1);

    v_items_out := v_items_out || jsonb_build_object(
      'peptide_id', v_peptide.id,
      'quantity', COALESCE((v_item->>'quantity')::int, 1),
      'unit_price', v_unit_price
    );
  END LOOP;

  -- ── Create the order ──────────────────────────────────────────────────
  INSERT INTO sales_orders (
    client_id, rep_id, org_id, status,
    total_amount, commission_amount,
    shipping_address, notes, delivery_method,
    payment_status, payment_method
  ) VALUES (
    p_contact_id,
    v_rep_id,
    v_org_id,
    'submitted',
    ROUND(v_total::numeric, 2),
    GREATEST(0, ROUND((v_total * v_commission_rate)::numeric, 2)),
    p_shipping_address,
    p_notes,
    COALESCE(p_delivery_method, 'ship'),
    'commission_offset',
    'commission_offset'
  )
  RETURNING id INTO v_order_id;

  -- ── Insert order items ────────────────────────────────────────────────
  INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
  SELECT
    v_order_id,
    (elem->>'peptide_id')::UUID,
    (elem->>'quantity')::INT,
    (elem->>'unit_price')::NUMERIC
  FROM jsonb_array_elements(v_items_out) AS elem;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', ROUND(v_total::numeric, 2),
    'commission', GREATEST(0, ROUND((v_total * v_commission_rate)::numeric, 2)),
    'pricing_mode', v_pricing_mode,
    'commission_rate', v_commission_rate,
    'items', v_items_out
  );
END;
$$;
