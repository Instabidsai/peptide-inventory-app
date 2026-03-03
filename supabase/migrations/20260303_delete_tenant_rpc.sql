-- Server-side tenant deletion that bypasses RLS.
-- Built from actual FK constraints queried from information_schema (2026-03-03).
-- 16 tables have NO ACTION FK to organizations — these BLOCK org deletion if not pre-deleted.
-- 2 tables have RESTRICT FKs to org-scoped tables (movement_items→bottles, lots→peptides).

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

  -- ═══════════════════════════════════════════════════════════════════
  -- PHASE 1: Deep children — tables that reference org-scoped tables
  --          via RESTRICT or NO ACTION FKs (would block parent deletion)
  -- ═══════════════════════════════════════════════════════════════════

  -- protocol_logs → protocol_items (SET NULL) → protocols (org_id)
  DELETE FROM protocol_logs WHERE protocol_item_id IN (
    SELECT pi.id FROM protocol_items pi
    JOIN protocols p ON pi.protocol_id = p.id
    WHERE p.org_id = target_org_id
  );

  -- client_inventory → peptides (NO ACTION), movements (NO ACTION)
  DELETE FROM client_inventory WHERE peptide_id IN (
    SELECT id FROM peptides WHERE org_id = target_org_id
  );

  -- protocol_items → protocols
  DELETE FROM protocol_items WHERE protocol_id IN (
    SELECT id FROM protocols WHERE org_id = target_org_id
  );

  -- movement_items → bottles (RESTRICT!) — has org_id column but NO FK to organizations
  DELETE FROM movement_items WHERE bottle_id IN (
    SELECT id FROM bottles WHERE org_id = target_org_id
  );

  -- lots → peptides (RESTRICT!) — must delete before peptides can be cascade-deleted
  DELETE FROM lots WHERE org_id = target_org_id;

  -- sales_order_items → sales_orders (assumed CASCADE), peptides (NO ACTION)
  DELETE FROM sales_order_items WHERE sales_order_id IN (
    SELECT id FROM sales_orders WHERE org_id = target_org_id
  );

  -- request_replies → client_requests
  DELETE FROM request_replies WHERE request_id IN (
    SELECT id FROM client_requests WHERE org_id = target_org_id
  );

  -- discussion_messages → discussion_topics (org_id NO ACTION)
  DELETE FROM discussion_messages WHERE topic_id IN (
    SELECT id FROM discussion_topics WHERE org_id = target_org_id
  );

  -- resource_comments / resource_views → resources (org_id NO ACTION)
  -- NOTE: resource_metrics is a SYSTEM table (no resource_id column), not tenant-scoped — skip it
  DELETE FROM resource_comments WHERE resource_id IN (
    SELECT id FROM resources WHERE org_id = target_org_id
  );
  DELETE FROM resource_views WHERE resource_id IN (
    SELECT id FROM resources WHERE org_id = target_org_id
  );

  -- scraped_peptides.imported_peptide_id → peptides (NO ACTION)
  -- scraped_peptides is CASCADE from org, but imported_peptide_id is NO ACTION
  -- NULL it out so the peptide CASCADE doesn't trip over it
  UPDATE scraped_peptides SET imported_peptide_id = NULL WHERE org_id = target_org_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- PHASE 2: All 16 tables with NO ACTION FK on org_id
  --          (these block DELETE FROM organizations if rows exist)
  -- ═══════════════════════════════════════════════════════════════════

  DELETE FROM admin_chat_messages WHERE org_id = target_org_id;
  DELETE FROM agent_audit_log WHERE org_id = target_org_id;
  DELETE FROM billing_events WHERE org_id = target_org_id;
  DELETE FROM commissions WHERE org_id = target_org_id;
  DELETE FROM contact_notes WHERE org_id = target_org_id;
  DELETE FROM daily_hours WHERE org_id = target_org_id;
  DELETE FROM discussion_topics WHERE org_id = target_org_id;
  DELETE FROM expenses WHERE org_id = target_org_id;
  DELETE FROM partner_discount_codes WHERE org_id = target_org_id;
  DELETE FROM protocols WHERE org_id = target_org_id;
  DELETE FROM resource_themes WHERE org_id = target_org_id;
  DELETE FROM resources WHERE org_id = target_org_id;
  DELETE FROM sent_emails WHERE org_id = target_org_id;

  -- Cross-org FK columns (not org_id but still reference organizations)
  UPDATE sales_orders SET source_org_id = NULL WHERE source_org_id = target_org_id;
  UPDATE tenant_config SET supplier_org_id = NULL WHERE supplier_org_id = target_org_id;
  DELETE FROM vendor_messages WHERE to_org_id = target_org_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- PHASE 3: Tables with org_id column but NO FK constraint (orphan cleanup)
  -- ═══════════════════════════════════════════════════════════════════

  DELETE FROM bug_reports WHERE org_id = target_org_id;
  DELETE FROM circuit_breaker_events WHERE org_id = target_org_id;
  DELETE FROM edge_function_logs WHERE org_id = target_org_id;
  DELETE FROM notifications WHERE org_id = target_org_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- PHASE 4: Delete the organization
  --          ON DELETE CASCADE handles remaining 34 tables automatically
  -- ═══════════════════════════════════════════════════════════════════

  DELETE FROM organizations WHERE id = target_org_id;

  RETURN jsonb_build_object('success', true, 'deleted_org_id', target_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
