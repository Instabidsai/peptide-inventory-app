-- Fix RLS policies to work with JWT auth (frontend) instead of set_config (edge functions only)

-- Drop old policies that only work with edge function set_config
DROP POLICY IF EXISTS "payment_pools_org_isolation" ON payment_pools;
DROP POLICY IF EXISTS "pool_transactions_org_isolation" ON pool_transactions;

-- payment_pools: org members can read
CREATE POLICY "payment_pools_read" ON payment_pools
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid())
    );

-- payment_pools: admins can insert
CREATE POLICY "payment_pools_write" ON payment_pools
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin'))
    );

-- payment_pools: admins can update
CREATE POLICY "payment_pools_update" ON payment_pools
    FOR UPDATE USING (
        org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin'))
    );

-- payment_pools: service role full access (edge functions)
CREATE POLICY "payment_pools_service" ON payment_pools
    FOR ALL USING (auth.role() = 'service_role');

-- pool_transactions: org members can read
CREATE POLICY "pool_transactions_read" ON pool_transactions
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid())
    );

-- pool_transactions: service role full access (edge functions)
CREATE POLICY "pool_transactions_service" ON pool_transactions
    FOR ALL USING (auth.role() = 'service_role');
