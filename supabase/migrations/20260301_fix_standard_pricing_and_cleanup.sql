-- Fix standard rep pricing, remove Jarvis AI, add per-person can_recruit, consolidate customer→client role
-- ==============================================

-- ==========================================
-- 1. Fix all standard tier reps to 2x cost
--    They were at price_multiplier=1.0 (at cost) — should be 2.0
-- ==========================================
UPDATE profiles
SET price_multiplier = 2.0,
    pricing_mode = 'cost_multiplier',
    cost_plus_markup = 2.0,
    updated_at = now()
WHERE partner_tier = 'standard'
  AND role = 'sales_rep'
  AND (price_multiplier IS NULL OR price_multiplier < 2.0);

-- ==========================================
-- 2. Delete Jarvis AI profile + user_roles
--    jarvis@affixed.ai in Pure US Peptide org
-- ==========================================
-- First delete user_roles referencing the Jarvis AI user
DELETE FROM user_roles
WHERE user_id IN (
    SELECT user_id FROM profiles
    WHERE full_name = 'Jarvis AI'
      AND user_id IS NOT NULL
);

-- Then delete the profile itself
DELETE FROM profiles
WHERE full_name = 'Jarvis AI';

-- ==========================================
-- 3. Add per-person can_recruit column
--    NULL = use tier default, true/false = override
-- ==========================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS can_recruit BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN profiles.can_recruit IS
  'Per-person recruitment override. NULL = use tier default from partner_tier_config. true/false = override.';

-- Set can_recruit=true for existing senior partners (they could always recruit)
UPDATE profiles
SET can_recruit = true
WHERE partner_tier = 'senior'
  AND role = 'sales_rep';

-- ==========================================
-- 4. Migrate customer role → client
--    Only 1 profile uses 'customer' role, all others use 'client'
--    They are functionally identical in the codebase
-- ==========================================
UPDATE profiles
SET role = 'client',
    updated_at = now()
WHERE role = 'customer';

UPDATE user_roles
SET role = 'client'::app_role
WHERE role = 'customer'::app_role;
