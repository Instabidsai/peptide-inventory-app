-- Add 'sales_rep' to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'sales_rep';

-- Update Thompson user role (safe update using email lookup if possible, or we assume the ID we found)
-- Using a DO block to look up ID safely would be best, but simple update by ID is fine for local.
-- However, for a migration file that runs in production, we should try to match on something stable if we can,
-- but migrations usually run against structure. Data patches are tricky.
-- I'll stick to just the ALTER TYPE here. The data fix (updating Thompson) will be done via script since that's specific to this instance.
