-- Add contact_id to resources table
ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE;

-- Update RLS Policy for 'Select' on resources
-- Allow users to see resources where contact_id is NULL (Global) OR contact_id matches their linked contact record

DROP POLICY IF EXISTS "Enable read access for all users" ON public.resources;

CREATE POLICY "Enable read access for public and assigned resources" ON public.resources
FOR SELECT
USING (
    contact_id IS NULL 
    OR 
    contact_id IN (
        SELECT id FROM public.contacts 
        WHERE linked_user_id = auth.uid()
    )
);

-- Enable write access for authenticated users (Admins/Staff)
-- In a stricter prod env, strict checks on auth.email() or app_role would be added.
CREATE POLICY "Enable write access for authenticated users" ON public.resources
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.resources
FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON public.resources
FOR DELETE
USING (auth.role() = 'authenticated');
