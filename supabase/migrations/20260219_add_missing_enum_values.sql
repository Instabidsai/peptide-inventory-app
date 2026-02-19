-- The sales_rep enum value exists in a local migration file but was never applied to the database.
-- Also add 'customer' for completeness.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'sales_rep';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'customer';
