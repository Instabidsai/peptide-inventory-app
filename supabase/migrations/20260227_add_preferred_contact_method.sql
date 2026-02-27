-- Add preferred_contact_method column to contacts table.
-- A runtime PostgREST error reported "column contacts.preferred_contact_method does not exist"
-- but no application code references it — likely a database-level artifact (view, policy, or
-- computed column) created outside of tracked migrations. Adding the column stops the error.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_contact_method text;

NOTIFY pgrst, 'reload schema';
