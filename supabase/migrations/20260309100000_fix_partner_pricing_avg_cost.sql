-- Fix: Partner pricing shows MSRP instead of 2x cost
-- Root cause: peptides.avg_cost is NULL for all 145 peptides.
-- The create_validated_order RPC uses peptides.avg_cost for partner pricing,
-- falls back to retail_price when avg_cost is 0/NULL.
-- Fix: 1) Backfill avg_cost from lots, 2) Trigger to keep it synced,
--       3) Update RPC to query lots directly as fallback.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Trigger function: update peptides.avg_cost when lots change
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_peptide_avg_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_peptide_id UUID;
  v_avg NUMERIC;
BEGIN
  -- Determine which peptide_id to update
  v_peptide_id := COALESCE(NEW.peptide_id, OLD.peptide_id);

  SELECT ROUND(AVG(cost_per_unit)::numeric, 2)
  INTO v_avg
  FROM lots
  WHERE peptide_id = v_peptide_id
    AND cost_per_unit > 0;

  UPDATE peptides
  SET avg_cost = v_avg,
      updated_at = NOW()
  WHERE id = v_peptide_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on lots table
DROP TRIGGER IF EXISTS trg_update_peptide_avg_cost ON lots;
CREATE TRIGGER trg_update_peptide_avg_cost
  AFTER INSERT OR UPDATE OF cost_per_unit OR DELETE
  ON lots
  FOR EACH ROW
  EXECUTE FUNCTION update_peptide_avg_cost();

-- ═══════════════════════════════════════════════════════════════════
-- 2. Backfill avg_cost for all existing peptides from lots
-- ═══════════════════════════════════════════════════════════════════
UPDATE peptides p
SET avg_cost = sub.avg_cost,
    updated_at = NOW()
FROM (
  SELECT peptide_id, ROUND(AVG(cost_per_unit)::numeric, 2) AS avg_cost
  FROM lots
  WHERE cost_per_unit > 0
  GROUP BY peptide_id
) sub
WHERE p.id = sub.peptide_id;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Fix create_validated_order RPC: query lots as fallback when
--    peptides.avg_cost is NULL/0
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_validated_order(
  p_items jsonb,
  p_shipping_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_method text DEFAULT 'ship',
  p_contact_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_contact RECORD;
  v_contact_id UUID;
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
  v_is_customer BOOLEAN := false;
  v_lot_avg_cost NUMERIC;
BEGIN
  -- Auth
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

  -- Resolve contact_id
  v_contact_id := p_contact_id;
  IF v_contact_id IS NULL THEN
    SELECT id INTO v_contact_id
    FROM contacts
    WHERE linked_user_id = v_user_id AND org_id = v_org_id
    LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No contact record found for your account. Please contact support.');
  END IF;

  -- Resolve contact details for pricing
  SELECT id, type, assigned_rep_id
  INTO v_contact
  FROM contacts
  WHERE id = v_contact_id AND org_id = v_org_id;

  -- Determine pricing source
  v_rep_id := v_profile.id;
  v_pricing_mode := COALESCE(v_profile.pricing_mode, 'percentage');
  v_multiplier := CASE
    WHEN COALESCE(v_profile.price_multiplier, 0) > 0 THEN v_profile.price_multiplier
    ELSE 1.0
  END;
  v_markup := COALESCE(v_profile.cost_plus_markup, 0);

  -- Partner self-orders: ALWAYS $0 commission (wholesale pricing, not MSRP)
  v_commission_rate := 0;

  IF v_contact IS NOT NULL THEN
    IF v_contact.type = 'customer' THEN
      v_is_customer := true;
      v_pricing_mode := 'percentage';
      -- Customer discount: minimum 20% off retail, matching frontend logic
      v_multiplier := LEAST(
        CASE WHEN COALESCE(v_profile.price_multiplier, 0) > 0
             THEN v_profile.price_multiplier ELSE 0.80 END,
        0.80
      );
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
  END IF;

  -- Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items provided');
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many items');
  END IF;

  -- Calculate prices
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

    -- Resolve effective avg_cost: prefer peptides.avg_cost, fallback to lots
    v_lot_avg_cost := v_peptide.avg_cost;
    IF COALESCE(v_lot_avg_cost, 0) <= 0 THEN
      SELECT ROUND(AVG(cost_per_unit)::numeric, 2)
      INTO v_lot_avg_cost
      FROM lots
      WHERE peptide_id = v_peptide.id
        AND org_id = v_org_id
        AND cost_per_unit > 0;
    END IF;

    IF v_pricing_mode = 'cost_plus' THEN
      v_unit_price := ROUND((COALESCE(v_lot_avg_cost, 0) + v_markup)::numeric, 2);
    ELSIF v_is_customer THEN
      -- Customers: discount off RETAIL price (not wholesale cost)
      v_unit_price := ROUND((COALESCE(v_peptide.retail_price, 0) * v_multiplier)::numeric, 2);
    ELSE
      -- Partners: pricing off avg_cost (wholesale)
      v_unit_price := ROUND((COALESCE(v_lot_avg_cost, 0) * v_multiplier)::numeric, 2);
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

  -- Create the order
  INSERT INTO sales_orders (
    client_id, rep_id, org_id, status,
    total_amount, commission_amount,
    shipping_address, notes, delivery_method,
    payment_status, payment_method
  ) VALUES (
    v_contact_id,
    v_rep_id,
    v_org_id,
    'submitted',
    ROUND(v_total::numeric, 2),
    GREATEST(0, ROUND((v_total * v_commission_rate)::numeric, 2)),
    p_shipping_address,
    p_notes,
    COALESCE(p_delivery_method, 'ship'),
    'unpaid',
    p_payment_method
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
  SELECT
    v_order_id,
    (elem->>'peptide_id')::UUID,
    (elem->>'quantity')::INT,
    (elem->>'unit_price')::NUMERIC
  FROM jsonb_array_elements(v_items_out) AS elem;

  -- Process commission chain (direct + parent + grandparent)
  IF v_commission_rate > 0 THEN
    PERFORM process_sale_commission(v_order_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', ROUND(v_total::numeric, 2),
    'commission', GREATEST(0, ROUND((v_total * v_commission_rate)::numeric, 2)),
    'pricing_mode', v_pricing_mode,
    'multiplier', v_multiplier,
    'commission_rate', v_commission_rate,
    'items', v_items_out
  );
END;
$function$;
