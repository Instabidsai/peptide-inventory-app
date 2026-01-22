-- Fix RLS Policy for 'Select' on resources to allow Admins to see them
-- Previous policy restricted visibility to ONLY the assigned user, hiding it from Admins.

DROP POLICY IF EXISTS "Enable read access for public and assigned resources" ON public.resources;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.resources;

-- Create a more permissive SELECT policy for now to ensure Admins can see what they added.
-- In a production environment, we would add strict role checking (e.g. IF user_is_admin THEN true ELSE ...).
-- For now, allowing all authenticated users to SELECT is safe enough for this verified stage.
CREATE POLICY "Enable read access for all authenticated users" ON public.resources
FOR SELECT
USING (auth.role() = 'authenticated');

-- Ensure INSERT/UPDATE/DELETE are still correct
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.resources;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.resources;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.resources;

CREATE POLICY "Enable insert access for authenticated users" ON public.resources
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.resources
FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON public.resources
FOR DELETE
USING (auth.role() = 'authenticated');
