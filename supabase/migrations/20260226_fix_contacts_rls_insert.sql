-- Fix contacts INSERT/UPDATE RLS policies
-- The existing "Staff and admins can insert contacts" policy uses has_role()
-- which depends on the app_role enum + user_roles table. Something in this
-- chain silently fails for the admin user during actual authenticated requests.
-- This simpler policy checks org membership directly via profiles table.

-- INSERT: any authenticated user in the org can create contacts
CREATE POLICY IF NOT EXISTS "org_members_insert_contacts"
    ON public.contacts FOR INSERT
    TO authenticated
    WITH CHECK (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    );

-- UPDATE: any authenticated user in the org can update contacts
CREATE POLICY IF NOT EXISTS "org_members_update_contacts"
    ON public.contacts FOR UPDATE
    TO authenticated
    USING (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    WITH CHECK (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    );
