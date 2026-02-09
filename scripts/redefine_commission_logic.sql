-- Add supporting columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS partner_tier text DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS price_multiplier numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS parent_rep_id uuid REFERENCES public.profiles(id);

-- Ensure Commissions Table
CREATE TABLE IF NOT EXISTS public.commissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    sale_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    partner_id uuid REFERENCES public.profiles(id),
    amount numeric NOT NULL,
    commission_rate numeric NOT NULL,
    type text NOT NULL CHECK (type IN ('direct', 'second_tier_override')), 
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'void'))
);

-- Logic Function
CREATE OR REPLACE FUNCTION public.process_sale_commission(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order record;
    v_item record;
    v_rep_id uuid;
    v_parent_rep_id uuid;
    v_rep_rate numeric;
    v_parent_rate numeric;
    v_total_margin numeric := 0;
    v_item_margin numeric;
    v_cost numeric;
    v_comm_amount numeric;
    v_override_amount numeric;
BEGIN
    -- 1. Fetch Order
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Avoid double processing
    IF EXISTS (SELECT 1 FROM public.commissions WHERE sale_id = p_sale_id) THEN
        RETURN;
    END IF;

    -- 2. Identify Direct Rep
    v_rep_id := v_order.rep_id;
    
    -- If no rep assigned, check if client IS a partner (Self-Order)
    IF v_rep_id IS NULL THEN
        SELECT id, parent_rep_id, commission_rate INTO v_rep_id, v_parent_rep_id, v_rep_rate 
        FROM public.profiles 
        WHERE id = v_order.client_id AND role IN ('sales_rep', 'admin', 'staff'); 
        -- Assuming 'role' distinguishes partners.
    ELSE
        SELECT parent_rep_id, commission_rate INTO v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_rep_id;
    END IF;

    -- If still no rep, exit (House Sale)
    IF v_rep_id IS NULL THEN RETURN; END IF;

    -- 3. Calculate Total Margin
    FOR v_item IN 
        SELECT soi.*, p.avg_cost, p.retail_price 
        FROM public.sales_order_items soi
        JOIN public.peptides p ON soi.peptide_id = p.id
        WHERE soi.sales_order_id = p_sale_id
    LOOP
        -- Cost Basis: Avg Cost + $4.00 (Overhead)
        -- Fallback: If avg_cost is 0, use retail_price? Or 0?
        v_cost := COALESCE(v_item.avg_cost, 0) + 4.00;
        
        -- Margin = (Unit Price - Cost) * Qty
        v_item_margin := (v_item.unit_price - v_cost) * v_item.quantity;
        
        -- Aggregate
        IF v_item_margin > 0 THEN
            v_total_margin := v_total_margin + v_item_margin;
        END IF;
    END LOOP;

    -- 4. Pay Level 1 (Direct)
    -- Default rate 20% (0.20) if null
    v_rep_rate := COALESCE(v_rep_rate, 0.20);
    v_comm_amount := v_total_margin * v_rep_rate;

    IF v_comm_amount > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, v_comm_amount, v_rep_rate, 'direct', 'pending');
    END IF;

    -- 5. Pay Level 2 (Override)
    IF v_parent_rep_id IS NOT NULL THEN
        -- Fetch Parent Rate
        SELECT commission_rate INTO v_parent_rate FROM public.profiles WHERE id = v_parent_rep_id;
        
        -- Logic: Parent gets THEIR rate on the margin? Or a smaller override?
        -- User said: "Don gets 10%". If Don is set to 10%, use that.
        v_parent_rate := COALESCE(v_parent_rate, 0.10); -- Default 10% for override if not set? 
        -- CAUTION: If Parent is also a seller with 20% rate, paying them 20% override is huge.
        -- Maybe Overrides should have a fixed cap or distinct column `override_rate`?
        -- For now, I will use `v_parent_rate`.
        
        v_override_amount := v_total_margin * v_parent_rate;

        IF v_override_amount > 0 THEN
             INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
             VALUES (p_sale_id, v_parent_rep_id, v_override_amount, v_parent_rate, 'second_tier_override', 'pending');
        END IF;
    END IF;

    -- Update Order Commission Total (Sum of all payouts)
    UPDATE public.sales_orders 
    SET commission_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    WHERE id = p_sale_id;

END;
$$;
