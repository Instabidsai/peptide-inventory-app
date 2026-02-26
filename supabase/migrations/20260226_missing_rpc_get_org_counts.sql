-- Migration: get_org_counts RPC
-- Source: NO SQL definition found anywhere in the codebase.
--         Reconstructed from calling code in:
--           src/hooks/use-onboarding-pipeline.ts lines 53-67
--           src/hooks/use-tenants.ts lines 50-71
-- Called with: supabase.rpc('get_org_counts') — no parameters
-- Expected return columns (from TypeScript usage):
--   org_id        (uuid)
--   user_count    (bigint) — used as Number(c?.user_count)
--   peptide_count (bigint) — used as Number(c?.peptide_count)
--   contact_count (bigint) — used as Number(c?.contact_count)
--   order_count   (bigint) — used as Number(c?.order_count)
--   automation_count (bigint) — used as Number(c?.automation_count)
--
-- NOTE: The automation_count column is only referenced in use-onboarding-pipeline.ts.
--       The actual table is automation_modules (confirmed in schema-master.sql line 194).

CREATE OR REPLACE FUNCTION public.get_org_counts()
 RETURNS TABLE (
   org_id uuid,
   user_count bigint,
   peptide_count bigint,
   contact_count bigint,
   order_count bigint,
   automation_count bigint
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    o.id AS org_id,
    (SELECT count(*) FROM profiles p WHERE p.org_id = o.id) AS user_count,
    (SELECT count(*) FROM peptides pe WHERE pe.org_id = o.id) AS peptide_count,
    (SELECT count(*) FROM contacts c WHERE c.org_id = o.id) AS contact_count,
    (SELECT count(*) FROM sales_orders so WHERE so.org_id = o.id) AS order_count,
    (SELECT count(*) FROM automation_modules am WHERE am.org_id = o.id) AS automation_count
  FROM organizations o;
$$;
