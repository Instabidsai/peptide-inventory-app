-- Drop the existing restrictive INSERT policy on organizations
DROP POLICY IF EXISTS "New users can create their first organization" ON public.organizations;

-- Create a new policy that allows authenticated users without an org to create one
-- This checks that either:
-- 1. The user has no profile yet, OR
-- 2. The user's profile has no org_id
CREATE POLICY "Authenticated users without org can create organization" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND org_id IS NOT NULL
  )
);