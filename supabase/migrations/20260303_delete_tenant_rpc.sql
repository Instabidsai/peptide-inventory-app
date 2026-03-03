-- Server-side tenant deletion that bypasses RLS.
-- The client-side cascade was failing because RLS policies use get_user_org_id(auth.uid())
-- which returns the CALLER's org, not the TARGET org. So all deletes matched 0 rows.

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(target_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super_admin can delete tenants';
  END IF;

  -- Verify target org exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = target_org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- ── Deep children first (tables that reference org-scoped tables) ──

  -- protocol_logs → protocol_items → protocols
  DELETE FROM protocol_logs WHERE protocol_item_id IN (
    SELECT pi.id FROM protocol_items pi
    JOIN protocols p ON pi.protocol_id = p.id
    WHERE p.org_id = target_org_id
  );

  -- client_inventory → peptides / movements / protocol_items (no CASCADE)
  DELETE FROM client_inventory WHERE peptide_id IN (
    SELECT id FROM peptides WHERE org_id = target_org_id
  );

  -- protocol_items → protocols
  DELETE FROM protocol_items WHERE protocol_id IN (
    SELECT id FROM protocols WHERE org_id = target_org_id
  );

  -- movement_items → bottles (ON DELETE RESTRICT!) / movements
  DELETE FROM movement_items WHERE bottle_id IN (
    SELECT id FROM bottles WHERE org_id = target_org_id
  );

  -- order_items → orders
  DELETE FROM order_items WHERE order_id IN (
    SELECT id FROM orders WHERE org_id = target_org_id
  );

  -- sales_order_items → sales_orders
  DELETE FROM sales_order_items WHERE sales_order_id IN (
    SELECT id FROM sales_orders WHERE org_id = target_org_id
  );

  -- commissions → sales_orders / profiles
  DELETE FROM commissions WHERE sale_id IN (
    SELECT id FROM sales_orders WHERE org_id = target_org_id
  );

  -- expenses → sales_orders (no CASCADE)
  DELETE FROM expenses WHERE related_sales_order_id IN (
    SELECT id FROM sales_orders WHERE org_id = target_org_id
  );

  -- request_replies → client_requests
  DELETE FROM request_replies WHERE request_id IN (
    SELECT id FROM client_requests WHERE org_id = target_org_id
  );

  -- ── Tables with org_id FK but NO ON DELETE CASCADE ──

  DELETE FROM contact_notes WHERE org_id = target_org_id;
  DELETE FROM protocols WHERE org_id = target_org_id;
  DELETE FROM daily_hours WHERE org_id = target_org_id;

  -- ── Delete the organization — ON DELETE CASCADE handles all remaining tables ──
  -- (profiles, user_roles, tenant_config, audit_log, automation_modules,
  --  peptides, contacts, lots, bottles, movements, sales_orders, orders,
  --  client_requests, partner_chat_messages, partner_suggestions,
  --  payment_email_queue, sender_aliases, org_features, notifications,
  --  pricing_tiers, partner_tier_config, partner_discount_codes,
  --  tenant_connections, subscription_plans)

  DELETE FROM organizations WHERE id = target_org_id;

  RETURN jsonb_build_object('success', true, 'deleted_org_id', target_org_id);
END;
$$;
