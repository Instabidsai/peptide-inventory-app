-- Add thumbnail_url, is_featured, and duration to resources table
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS thumbnail_url text,
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS duration integer;

-- Update types if necessary (handled by frontend types usually)
-- Verify RLS (resources usually public read, admin write)
-- Existing policies should cover new columns automatically for row-level operations.
