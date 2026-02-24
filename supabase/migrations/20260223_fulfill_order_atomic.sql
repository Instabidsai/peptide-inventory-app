-- Atomic fulfill order RPC — prevents race conditions on bottle allocation
-- Runs inside a transaction: locks bottles, verifies stock, allocates, updates status

CREATE OR REPLACE FUNCTION fulfill_order_atomic(
  p_order_id uuid,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_item record;
  v_movement_id uuid;
  v_bottle record;
  v_allocated_count int;
  v_total_bottles int := 0;
BEGIN
  -- 1. Lock and fetch the order
  SELECT id, status, client_id, payment_status, amount_paid
  INTO v_order
  FROM sales_orders
  WHERE id = p_order_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found in your organization');
  END IF;

  IF v_order.status = 'fulfilled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already fulfilled');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot fulfill cancelled order');
  END IF;

  -- 2. Create movement record
  INSERT INTO movements (org_id, type, contact_id, movement_date, notes, payment_status, amount_paid)
  VALUES (
    p_org_id,
    'sale',
    v_order.client_id,
    CURRENT_DATE,
    '[SO:' || p_order_id || '] Fulfilled Sales Order #' || LEFT(p_order_id::text, 8),
    COALESCE(v_order.payment_status, 'unpaid'),
    COALESCE(v_order.amount_paid, 0)
  )
  RETURNING id INTO v_movement_id;

  -- 3. For each order item, allocate bottles FIFO
  FOR v_item IN
    SELECT soi.id, soi.peptide_id, soi.quantity, soi.unit_price, p.name as peptide_name
    FROM sales_order_items soi
    JOIN peptides p ON p.id = soi.peptide_id
    WHERE soi.order_id = p_order_id
  LOOP
    v_allocated_count := 0;

    -- Lock and allocate bottles FIFO
    FOR v_bottle IN
      SELECT b.id
      FROM bottles b
      JOIN lots l ON l.id = b.lot_id
      WHERE l.peptide_id = v_item.peptide_id
        AND b.status = 'in_stock'
      ORDER BY b.created_at ASC
      LIMIT v_item.quantity
      FOR UPDATE OF b
    LOOP
      -- Create movement item
      INSERT INTO movement_items (movement_id, bottle_id, price_at_sale)
      VALUES (v_movement_id, v_bottle.id, v_item.unit_price);

      -- Mark bottle as sold
      UPDATE bottles SET status = 'sold' WHERE id = v_bottle.id;

      v_allocated_count := v_allocated_count + 1;
    END LOOP;

    -- Verify we got enough
    IF v_allocated_count < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %. Need %, have %',
        v_item.peptide_name, v_item.quantity, v_allocated_count;
    END IF;

    v_total_bottles := v_total_bottles + v_allocated_count;
  END LOOP;

  -- 4. Mark order fulfilled
  UPDATE sales_orders SET status = 'fulfilled' WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'bottles_allocated', v_total_bottles
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Transaction auto-rolls back
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Cascade delete contact RPC — replaces 7-step client-side cascade
-- All deletes run in a single transaction for atomicity
CREATE OR REPLACE FUNCTION delete_contact_cascade(
  p_contact_id uuid,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_protocol_ids uuid[];
  v_item_ids uuid[];
  v_deleted_orders int := 0;
  v_deleted_movements int := 0;
BEGIN
  -- Verify contact belongs to org
  SELECT id, name INTO v_contact
  FROM contacts
  WHERE id = p_contact_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact not found in your organization');
  END IF;

  -- Step 1: Delete sales order items, then sales orders
  DELETE FROM sales_order_items
  WHERE order_id IN (
    SELECT id FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id
  );
  DELETE FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;
  GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;

  -- Step 2: Delete movement items, then movements
  DELETE FROM movement_items
  WHERE movement_id IN (
    SELECT id FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id
  );
  DELETE FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;
  GET DIAGNOSTICS v_deleted_movements = ROW_COUNT;

  -- Step 3: Delete client inventory
  DELETE FROM client_inventory WHERE contact_id = p_contact_id;

  -- Step 4: Delete protocol hierarchy (logs → items → supplements → feedback → protocols)
  SELECT array_agg(id) INTO v_protocol_ids
  FROM protocols WHERE contact_id = p_contact_id;

  IF v_protocol_ids IS NOT NULL AND array_length(v_protocol_ids, 1) > 0 THEN
    SELECT array_agg(id) INTO v_item_ids
    FROM protocol_items WHERE protocol_id = ANY(v_protocol_ids);

    IF v_item_ids IS NOT NULL AND array_length(v_item_ids, 1) > 0 THEN
      DELETE FROM protocol_logs WHERE protocol_item_id = ANY(v_item_ids);
      DELETE FROM protocol_items WHERE protocol_id = ANY(v_protocol_ids);
    END IF;

    DELETE FROM protocol_supplements WHERE protocol_id = ANY(v_protocol_ids);
    DELETE FROM protocol_feedback WHERE protocol_id = ANY(v_protocol_ids);
    DELETE FROM protocols WHERE contact_id = p_contact_id;
  END IF;

  -- Step 5: Delete contact notes
  DELETE FROM contact_notes WHERE contact_id = p_contact_id;

  -- Step 6: Delete resources
  DELETE FROM resources WHERE contact_id = p_contact_id;

  -- Step 7: Delete the contact
  DELETE FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'contact_name', v_contact.name,
    'deleted_orders', v_deleted_orders,
    'deleted_movements', v_deleted_movements
  );
END;
$$;
