-- Consolidated delete_contact_cascade: merges all prior fixes
-- Fixes: commissions/expenses FK, client_requests.user_id lookup, auth cleanup
-- Adds: GRANT EXECUTE + NOTIFY pgrst for PostgREST schema cache

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
  v_deleted_orders int := 0;
  v_deleted_movements int := 0;
  v_auth_deleted boolean := false;
BEGIN
  SELECT id, name, linked_user_id INTO v_contact
  FROM contacts
  WHERE id = p_contact_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact not found in your organization');
  END IF;

  -- Sales orders: expenses/commissions first (FK RESTRICT), then items, then orders
  SELECT array_agg(id) INTO v_sales_order_ids
  FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;

  IF v_sales_order_ids IS NOT NULL AND array_length(v_sales_order_ids, 1) > 0 THEN
    DELETE FROM expenses WHERE related_sales_order_id = ANY(v_sales_order_ids);
    DELETE FROM commissions WHERE sale_id = ANY(v_sales_order_ids);
    DELETE FROM sales_order_items WHERE order_id = ANY(v_sales_order_ids);
    DELETE FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  END IF;

  -- Movements: client_inventory first (FK RESTRICT), then items, then movements
  SELECT array_agg(id) INTO v_movement_ids
  FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;

  IF v_movement_ids IS NOT NULL AND array_length(v_movement_ids, 1) > 0 THEN
    DELETE FROM client_inventory WHERE movement_id = ANY(v_movement_ids);
    DELETE FROM movement_items WHERE movement_id = ANY(v_movement_ids);
    DELETE FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_movements = ROW_COUNT;
  END IF;

  DELETE FROM client_inventory WHERE contact_id = p_contact_id;

  -- Protocols: logs -> items -> supplements -> feedback -> protocols
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

  DELETE FROM contact_notes WHERE contact_id = p_contact_id;
  DELETE FROM resources WHERE contact_id = p_contact_id;

  -- client_requests uses user_id, not contact_id
  IF v_contact.linked_user_id IS NOT NULL THEN
    DELETE FROM client_requests WHERE user_id = v_contact.linked_user_id;
  END IF;

  -- Delete the contact record before auth user (contacts.linked_user_id may FK to auth.users)
  DELETE FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  -- Full auth cleanup: cascades to meal_logs, body_comp_logs, water_logs, etc.
  IF v_contact.linked_user_id IS NOT NULL THEN
    DELETE FROM profiles WHERE user_id = v_contact.linked_user_id;
    DELETE FROM user_roles WHERE user_id = v_contact.linked_user_id;
    DELETE FROM discussion_messages WHERE user_id = v_contact.linked_user_id;
    DELETE FROM discussion_topics WHERE user_id = v_contact.linked_user_id;
    DELETE FROM resource_views WHERE user_id = v_contact.linked_user_id;
    DELETE FROM auth.users WHERE id = v_contact.linked_user_id;
    v_auth_deleted := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_contact', v_contact.name,
    'deleted_orders', COALESCE(v_deleted_orders, 0),
    'deleted_movements', COALESCE(v_deleted_movements, 0),
    'auth_user_deleted', v_auth_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_contact_cascade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_contact_cascade(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
