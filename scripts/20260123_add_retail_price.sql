-- Add retail_price to peptides table
alter table peptides add column if not exists retail_price numeric default 0;

-- Update RLS if needed (but usually public properties are fine)
-- (No RLS change needed strictly for adding a column if existing policies cover 'select *' and 'update')
