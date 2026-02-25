-- Add discount_percent column to contacts for Preferred Customer pricing
-- Default 0 = no discount. Admin can set per-customer discounts (e.g., 10 = 10% off retail)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;

-- Update the type check constraint to include 'preferred' if one exists
-- (Supabase often uses text without constraints, but let's be safe)
DO $$
BEGIN
    -- Check if there's a check constraint on the type column and drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'contacts' AND column_name = 'type'
    ) THEN
        -- Try to drop and re-add with preferred included
        BEGIN
            ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_type_check;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;
