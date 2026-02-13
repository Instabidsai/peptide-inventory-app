-- Add pricing mode support: 'percentage' (default, uses price_multiplier) or 'cost_plus' (uses avg lot cost + markup)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS cost_plus_markup NUMERIC DEFAULT 0;

-- Add a check constraint
ALTER TABLE profiles
  ADD CONSTRAINT pricing_mode_check CHECK (pricing_mode IN ('percentage', 'cost_plus'));
