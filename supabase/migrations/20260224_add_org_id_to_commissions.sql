-- Add org_id to commissions table for direct tenant scoping.
-- Currently commissions is scoped via sale_id → sales_orders.org_id (join-based).
-- Adding a direct org_id column enables efficient direct filtering.

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill from sales_orders
UPDATE public.commissions c
SET org_id = so.org_id
FROM public.sales_orders so
WHERE c.sale_id = so.id AND c.org_id IS NULL;

-- Create index for fast tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_commissions_org_id ON public.commissions(org_id);

-- RLS policy: only users in the same org can see commissions
-- (supplement to existing RLS if any)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'commissions_org_isolation'
  ) THEN
    CREATE POLICY commissions_org_isolation ON public.commissions
      FOR ALL
      USING (
        org_id IN (
          SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
      );
  END IF;
END $$;
