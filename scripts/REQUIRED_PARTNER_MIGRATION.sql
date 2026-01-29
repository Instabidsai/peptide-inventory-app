
-- ==========================================
-- PARTNER HIERARCHY & COMMISSION SYSTEM
-- ==========================================

-- 1. ADD HIERARCHY COLUMNS TO PROFILES
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS parent_partner_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS partner_tier TEXT DEFAULT 'standard' CHECK (partner_tier IN ('standard', 'senior', 'director', 'executive'));

-- 2. CREATE COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES profiles(id),
    amount DECIMAL(10, 2) NOT NULL,
    commission_rate DECIMAL(5, 4), -- e.g. 0.1500 for 15%
    type TEXT CHECK (type IN ('direct', 'second_tier_override', 'third_tier_override')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'void')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sale ON commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles(parent_partner_id);

-- 4. RLS POLICIES
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own commissions" ON commissions
    FOR SELECT
    USING (auth.uid() = partner_id);

CREATE POLICY "Admins view all commissions" ON commissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 5. RPC: GET DOWNLINE (Recursive)
DROP FUNCTION IF EXISTS get_partner_downline;

CREATE OR REPLACE FUNCTION get_partner_downline(root_id UUID)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    partner_tier TEXT,
    total_sales DECIMAL,
    depth INT,
    path UUID[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        SELECT 
            p.id, 
            p.full_name, 
            p.email, 
            p.partner_tier, 
            0.00 as total_sales,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE p.parent_partner_id = root_id
        
        UNION ALL
        
        SELECT 
            p.id, 
            p.full_name, 
            p.email, 
            p.partner_tier, 
            0.00 as total_sales,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON p.parent_partner_id = d.id
        WHERE d.depth < 5
    )
    SELECT 
        d.id, 
        d.full_name, 
        d.email, 
        d.partner_tier,
        CAST(d.total_sales AS DECIMAL) as total_sales,
        d.depth,
        d.path 
    FROM downline d;
END;
$$;

-- 6. FUNCTION: PROCESS COMMISSIONS (To be called by backend/triggers)
CREATE OR REPLACE FUNCTION process_sale_commission(p_sale_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rep_id UUID;
    v_parent_id UUID;
    v_sale_amount DECIMAL;
    v_commission_amount DECIMAL;
    v_override_amount DECIMAL;
    v_existing_commission_id UUID;
BEGIN
    -- Get sale details
    SELECT rep_id, total_amount INTO v_rep_id, v_sale_amount
    FROM sales_orders
    WHERE id = p_sale_id;

    IF v_rep_id IS NULL THEN
        RETURN;
    END IF;

    -- Check if exists
    SELECT id INTO v_existing_commission_id FROM commissions WHERE sale_id = p_sale_id;
    IF v_existing_commission_id IS NOT NULL THEN
        RETURN;
    END IF;

    -- Direct Commission (15%)
    v_commission_amount := v_sale_amount * 0.15;

    INSERT INTO commissions (sale_id, partner_id, amount, commission_rate, type, status)
    VALUES (p_sale_id, v_rep_id, v_commission_amount, 0.15, 'direct', 'pending');

    -- Override (Level 2 - 5%)
    SELECT parent_partner_id INTO v_parent_id FROM profiles WHERE id = v_rep_id;
    
    IF v_parent_id IS NOT NULL THEN
        v_override_amount := v_sale_amount * 0.05;
        
        INSERT INTO commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_parent_id, v_override_amount, 0.05, 'second_tier_override', 'pending');
    END IF;

    -- Mark status
    -- Assuming commission_status column exists on sales_orders from previous scripts
    UPDATE sales_orders SET commission_status = 'available' WHERE id = p_sale_id;
END;
$$;
