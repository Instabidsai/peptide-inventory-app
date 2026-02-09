-- 1. Add columns to profiles if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS partner_tier text DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS price_multiplier numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS parent_rep_id uuid REFERENCES public.profiles(id);

-- 2. Create Commissions Table if not exists (Checking schema)
CREATE TABLE IF NOT EXISTS public.commissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    partner_id uuid REFERENCES public.profiles(id),
    order_id uuid REFERENCES public.orders(id), -- or sales_orders
    amount numeric,
    percent numeric, 
    status text DEFAULT 'pending', -- pending, available, paid
    type text -- 'personal_sale', 'downline_override'
);

-- 3. Create Function to Calculate Commissions on Insert to Sales/Orders
-- This is a placeholder. I need to know the actual Sales table name first.
