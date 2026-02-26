-- Fix delete_contact_cascade to clean up commissions and expenses
-- before deleting sales_orders (expenses has FK RESTRICT to sales_orders)

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
  v_sales_order_ids uuid[];
  v_movement_ids uuid[];
  v_bottle_ids uuid[];
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

  -- Collect sales order IDs for this contact
  SELECT array_agg(id) INTO v_sales_order_ids
  FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;

  IF v_sales_order_ids IS NOT NULL AND array_length(v_sales_order_ids, 1) > 0 THEN
    -- Step 1a: Delete expenses linked to these sales orders (FK RESTRICT)
    DELETE FROM expenses
    WHERE related_sales_order_id = ANY(v_sales_order_ids);

    -- Step 1b: Delete commissions linked to these sales orders
    DELETE FROM commissions
    WHERE sale_id = ANY(v_sales_order_ids);

    -- Step 1c: Delete sales order items
    DELETE FROM sales_order_items
    WHERE order_id = ANY(v_sales_order_ids);

    -- Step 1d: Delete the sales orders
    DELETE FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  END IF;

  -- Collect movement IDs for this contact
  SELECT array_agg(id) INTO v_movement_ids
  FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;

  IF v_movement_ids IS NOT NULL AND array_length(v_movement_ids, 1) > 0 THEN
    -- Step 2a: Delete client_inventory linked to these movements (FK RESTRICT)
    DELETE FROM client_inventory
    WHERE movement_id = ANY(v_movement_ids);

    -- Step 2b: Delete movement items (CASCADE would handle this but be explicit)
    DELETE FROM movement_items
    WHERE movement_id = ANY(v_movement_ids);

    -- Step 2c: Delete movements
    DELETE FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_movements = ROW_COUNT;
  END IF;

  -- Step 3: Delete remaining client inventory (by contact_id directly)
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

  -- Step 7: Delete client requests
  DELETE FROM client_requests WHERE contact_id = p_contact_id;

  -- Step 8: Delete the contact
  DELETE FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'contact_name', v_contact.name,
    'deleted_orders', v_deleted_orders,
    'deleted_movements', v_deleted_movements
  );
END;
$$;
