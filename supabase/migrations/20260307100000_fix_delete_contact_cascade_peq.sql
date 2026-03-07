-- Fix delete_contact_cascade: nullify payment_email_queue.ai_suggested_contact_id
-- before deleting the contact (FK has NO ACTION, was causing FK violation errors)

CREATE OR REPLACE FUNCTION public.delete_contact_cascade(p_contact_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact not found in your organization');
  END IF;

  -- Sales orders and related
  SELECT array_agg(id) INTO v_sales_order_ids
  FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;

  IF v_sales_order_ids IS NOT NULL AND array_length(v_sales_order_ids, 1) > 0 THEN
    DELETE FROM expenses WHERE related_sales_order_id = ANY(v_sales_order_ids);
    DELETE FROM commissions WHERE sale_id = ANY(v_sales_order_ids);
    DELETE FROM sales_order_items WHERE order_id = ANY(v_sales_order_ids);
    DELETE FROM sales_orders WHERE client_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  END IF;

  -- Movements and related
  SELECT array_agg(id) INTO v_movement_ids
  FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;

  IF v_movement_ids IS NOT NULL AND array_length(v_movement_ids, 1) > 0 THEN
    DELETE FROM client_inventory WHERE movement_id = ANY(v_movement_ids);
    DELETE FROM movement_items WHERE movement_id = ANY(v_movement_ids);
    DELETE FROM movements WHERE contact_id = p_contact_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_deleted_movements = ROW_COUNT;
  END IF;

  DELETE FROM client_inventory WHERE contact_id = p_contact_id;

  -- Protocols and related
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

  IF v_contact.linked_user_id IS NOT NULL THEN
    DELETE FROM client_requests WHERE user_id = v_contact.linked_user_id;
  END IF;

  -- Nullify payment_email_queue references (NO ACTION FK)
  UPDATE payment_email_queue SET ai_suggested_contact_id = NULL WHERE ai_suggested_contact_id = p_contact_id;

  -- Delete the contact
  DELETE FROM contacts WHERE id = p_contact_id AND org_id = p_org_id;

  -- Clean up linked auth user if exists
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
$function$;
