-- Fix function search paths for security

-- Fix generate_bottle_uid function
CREATE OR REPLACE FUNCTION public.generate_bottle_uid()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    seq_val BIGINT;
    year_part TEXT;
BEGIN
    SELECT nextval('public.bottle_uid_seq') INTO seq_val;
    year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    RETURN 'B-' || year_part || '-' || LPAD(seq_val::TEXT, 7, '0');
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Fix overly permissive organization insert policy
-- Drop the old permissive policy and create a proper one
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- Create a more restrictive policy - users can only create orgs if they don't already belong to one
CREATE POLICY "New users can create their first organization"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_org_id(auth.uid()) IS NULL);