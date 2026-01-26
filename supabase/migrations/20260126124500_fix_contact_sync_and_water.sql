-- 1. FIX: Open up master data for authenticated read to facilitate joins (Fixes "Unknown" contacts)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peptides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read Contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated Read Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated Read Peptides" ON public.peptides;

CREATE POLICY "Authenticated Read Contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated Read Profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated Read Peptides" ON public.peptides FOR SELECT TO authenticated USING (true);

-- 2. SCHEMA: Support non-bottle items (like Water charges, supplies, services)
ALTER TABLE public.movement_items ALTER COLUMN bottle_id DROP NOT NULL;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movement_items' AND column_name = 'description') THEN
        ALTER TABLE public.movement_items ADD COLUMN description TEXT;
    END IF;
END $$;

-- 3. ADD: Bacteriostatic Water Peptide
DO $$ 
DECLARE 
    target_org_id UUID;
BEGIN
    SELECT id INTO target_org_id FROM public.organizations LIMIT 1;
    
    IF NOT EXISTS (SELECT 1 FROM public.peptides WHERE name = 'Bacteriostatic Water') THEN
        INSERT INTO public.peptides (org_id, name, description, active)
        VALUES (target_org_id, 'Bacteriostatic Water', 'Bacteriostatic water for reconstitution', true);
    END IF;
END $$;
