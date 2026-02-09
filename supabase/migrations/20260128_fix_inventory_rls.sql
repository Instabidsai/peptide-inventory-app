-- RLS Fix for Inventory (Lots & Bottles)
-- User reports counts are wrong (likely hidden rows due to RLS).
-- We will standardize policies for lots and bottles.

ALTER TABLE IF EXISTS public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bottles ENABLE ROW LEVEL SECURITY;

-- DROP OLD POLICIES (Lots)
DROP POLICY IF EXISTS "Users can view lots in their org" ON public.lots;
DROP POLICY IF EXISTS "Staff and admins can insert lots" ON public.lots;
DROP POLICY IF EXISTS "Staff and admins can update lots" ON public.lots;
DROP POLICY IF EXISTS "Admins can delete lots" ON public.lots;

-- CREATE NEW POLICIES (Lots)
CREATE POLICY "Users can view lots in their org"
    ON public.lots FOR SELECT TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert lots in their org"
    ON public.lots FOR INSERT TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update lots in their org"
    ON public.lots FOR UPDATE TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete lots in their org"
    ON public.lots FOR DELETE TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

-- DROP OLD POLICIES (Bottles)
DROP POLICY IF EXISTS "Users can view bottles in their org" ON public.bottles;
DROP POLICY IF EXISTS "Staff and admins can insert bottles" ON public.bottles;
DROP POLICY IF EXISTS "Staff and admins can update bottles" ON public.bottles;
DROP POLICY IF EXISTS "Admins can delete bottles" ON public.bottles;

-- CREATE NEW POLICIES (Bottles)
CREATE POLICY "Users can view bottles in their org"
    ON public.bottles FOR SELECT TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert bottles in their org"
    ON public.bottles FOR INSERT TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update bottles in their org"
    ON public.bottles FOR UPDATE TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete bottles in their org"
    ON public.bottles FOR DELETE TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));
