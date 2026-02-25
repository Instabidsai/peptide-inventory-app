-- Add 'preferred' to contact_type enum (the type column uses this enum, not a check constraint)
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'preferred' AFTER 'customer';

-- Add discount_percent column to contacts for Preferred Customer pricing
-- Default 0 = no discount. Admin can set per-customer discounts (e.g., 10 = 10% off retail)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
