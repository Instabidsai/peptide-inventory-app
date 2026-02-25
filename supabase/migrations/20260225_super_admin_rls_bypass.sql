-- Super admin RLS bypass policies
-- Allows super_admin users to see ALL orgs, tenant configs, and profiles
-- Required for the SaaS Admin / Vendor panel to work properly

-- Helper function: is current user a super_admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    );
$$;

-- Super admin can view ALL organizations
CREATE POLICY "Super admin can view all organizations"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

-- Super admin can update ALL organizations
CREATE POLICY "Super admin can update all organizations"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Super admin can view ALL tenant configs
CREATE POLICY "Super admin can view all tenant_config"
    ON public.tenant_config FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

-- Super admin can update ALL tenant configs
CREATE POLICY "Super admin can update all tenant_config"
    ON public.tenant_config FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Super admin can view ALL profiles (needed for tenant detail views)
CREATE POLICY "Super admin can view all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_super_admin());
