-- Add overhead_per_unit to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS overhead_per_unit DECIMAL(10, 2) DEFAULT 4.00;

-- Comment on column
COMMENT ON COLUMN profiles.overhead_per_unit IS 'Fixed dollar amount added to base cost for this partner (e.g. $4.00 markup per vial)';
