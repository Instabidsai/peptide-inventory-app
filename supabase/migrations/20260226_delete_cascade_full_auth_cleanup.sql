-- Full auth cleanup: when deleting a contact with a linked_user_id,
-- also delete their profiles entry and auth.users record.
-- Deleting from auth.users cascades to: client_requests, meal_logs,
-- body_comp_logs, daily_macro_goals, partner_ai_messages, partner_ai_suggestions,
-- onboarding_messages, water_logs, and any other table with ON DELETE CASCADE to auth.users.

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
  v_auth_deleted boolean := false;
BEGIN
  -- Verify contact belongs to org
  SELECT id, name, linked_user_id INTO v_contact
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

  -- Step 4: Delete protocol hierarchy (logs -> items -> supplements -> feedback -> protocols)
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

  -- Step 7: Delete the contact record FIRST (before auth user, since contacts.linked_user_id may FK to auth.users)
  DELETE FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  -- Step 8: Full auth cleanup - delete profiles and auth user
  -- Deleting from auth.users cascades to: client_requests, meal_logs, body_comp_logs,
  -- daily_macro_goals, water_logs, partner_ai_messages, partner_ai_suggestions,
  -- onboarding_messages, request_replies, and any other table with ON DELETE CASCADE
  IF v_contact.linked_user_id IS NOT NULL THEN
    -- Delete profile (may have RESTRICT or no cascade)
    DELETE FROM profiles WHERE user_id = v_contact.linked_user_id;

    -- Delete user_roles if exists
    DELETE FROM user_roles WHERE user_id = v_contact.linked_user_id;

    -- Delete discussion_topics and discussion_replies (may not cascade)
    DELETE FROM discussion_replies WHERE user_id = v_contact.linked_user_id;
    DELETE FROM discussion_topics WHERE user_id = v_contact.linked_user_id;

    -- Delete resource_views (ON DELETE SET NULL, but clean up anyway)
    DELETE FROM resource_views WHERE user_id = v_contact.linked_user_id;

    -- Delete the auth user — this cascades to all remaining tables with ON DELETE CASCADE
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
