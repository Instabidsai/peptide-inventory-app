-- Fix: COALESCE types text and integer cannot be matched
-- The avg_cost column in peptides was type TEXT, but create_validated_order
-- does COALESCE(v_peptide.avg_cost, 0) which requires both args to be the same type.
-- Since avg_cost should always be numeric, convert the column.

ALTER TABLE peptides ALTER COLUMN avg_cost TYPE NUMERIC USING avg_cost::NUMERIC;
