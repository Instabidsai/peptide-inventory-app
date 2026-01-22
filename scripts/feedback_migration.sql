-- Add Admin Reply capabilities to protocol_feedback table

ALTER TABLE public.protocol_feedback
ADD COLUMN IF NOT EXISTS admin_response text,
ADD COLUMN IF NOT EXISTS response_link text,
ADD COLUMN IF NOT EXISTS response_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_read_by_client boolean DEFAULT false;

-- Policy to allow Admins (authenticated users) to UPDATE feedback (to add replies)
-- Currently, we might only have "Enable insert access for authenticated users" or "Enable read access".
-- We need to ensure we can UPDATE specific columns.

-- Drop existing update policy if it restricts too much, or create a new one.
-- Assuming we want authenticated users (Admins) to be able to update any feedback.
CREATE POLICY "Enable update access for authenticated users" ON public.protocol_feedback
FOR UPDATE
USING (auth.role() = 'authenticated');
