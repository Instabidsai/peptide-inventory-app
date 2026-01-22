-- Run this in the Supabase SQL Editor to fix the "column not found" error
ALTER TABLE protocol_items
ADD COLUMN IF NOT EXISTS dosage_amount NUMERIC,
ADD COLUMN IF NOT EXISTS dosage_unit TEXT,
ADD COLUMN IF NOT EXISTS frequency TEXT,
ADD COLUMN IF NOT EXISTS duration_days INTEGER,
ADD COLUMN IF NOT EXISTS cost_multiplier NUMERIC DEFAULT 1.0;
