
-- 1. Add payment implementation to lots table
ALTER TABLE public.lots 
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
ADD COLUMN IF NOT EXISTS payment_date date,
ADD COLUMN IF NOT EXISTS payment_method text;

-- 2. Mark ALL existing lots as 'paid' (Backfill)
UPDATE public.lots
SET payment_status = 'paid',
    payment_date = CURRENT_DATE -- Or created_at? User just said "paid up". Today is fine or null.
WHERE payment_status IS NULL OR payment_status = 'unpaid';

-- 3. Update RLS (if needed) - existing policies usually cover 'all columns' for admin
