-- expenses table already exists (created via UI) but lacks org_id column.
-- Add org_id for future multi-tenant support.
-- For now, RLS scopes via has_role(admin/staff) only.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill existing rows with the default org
-- (only run if there's a single org — adjust if multi-tenant)
UPDATE public.expenses SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
