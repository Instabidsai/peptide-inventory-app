
-- 1. Add hierarchy columns to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS parent_partner_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS partner_tier TEXT DEFAULT 'standard' CHECK (partner_tier IN ('standard', 'senior', 'director', 'executive'));

-- 2. Create Commissions table
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

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sale ON commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles(parent_partner_id);

-- 4. Enable RLS on commissions
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Commissions
-- Partners can view their own commissions
CREATE POLICY "Partners view own commissions" ON commissions
    FOR SELECT
    USING (auth.uid() = partner_id);

-- Admins can view all commissions
CREATE POLICY "Admins view all commissions" ON commissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 6. RPC: Get Downline (Recursive)
-- Dropping first to allow signature changes if verified
DROP FUNCTION IF EXISTS get_partner_downline;

CREATE OR REPLACE FUNCTION get_partner_downline(root_id UUID)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    partner_tier TEXT,
    total_sales DECIMAL, -- Placeholder for now
    depth INT,
    path UUID[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Base case: direct children
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
        
        -- Recursive step
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
        WHERE d.depth < 5 -- Safety limit to prevent infinite loops
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
