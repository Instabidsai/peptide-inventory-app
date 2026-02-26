-- =============================================================
-- Scale-hardening: composite indexes for high-traffic query paths
-- Every Supabase PostgREST query that filters by (org_id + X)
-- benefits from a composite index instead of scanning org_id alone.
-- =============================================================

-- orders: 5+ hooks filter by (org_id, status='pending')
CREATE INDEX IF NOT EXISTS idx_orders_org_status
  ON public.orders(org_id, status);

-- movements: financials queries filter by (org_id, type)
CREATE INDEX IF NOT EXISTS idx_movements_org_type
  ON public.movements(org_id, type);

-- sales_orders: NO org_id index existed at all + financials filters by status
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_id
  ON public.sales_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_status
  ON public.sales_orders(org_id, status);

-- commissions: financials sums by (org_id, status)
-- NOTE: Only runs if org_id column exists (added by 20260224_add_org_id_to_commissions.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commissions' AND column_name='org_id') THEN
    CREATE INDEX IF NOT EXISTS idx_commissions_org_status ON public.commissions(org_id, status);
  END IF;
END $$;

-- contacts: list queries filter by (org_id, type)
CREATE INDEX IF NOT EXISTS idx_contacts_org_type
  ON public.contacts(org_id, type);

-- contacts: sales_rep filter uses assigned_rep_id IN (...)
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_rep
  ON public.contacts(assigned_rep_id);

-- bug_reports: sentinel polls most recent, needs created_at ordering
CREATE INDEX IF NOT EXISTS idx_bug_reports_created
  ON public.bug_reports(created_at DESC);

-- lots: usePeptides aggregates cost_per_unit grouped by peptide_id per org
CREATE INDEX IF NOT EXISTS idx_lots_org_peptide
  ON public.lots(org_id, peptide_id);

-- bottles: stock count RPC and inventory queries filter by (org_id, status)
CREATE INDEX IF NOT EXISTS idx_bottles_org_status
  ON public.bottles(org_id, status);
