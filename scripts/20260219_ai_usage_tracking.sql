-- ================================================================
-- AUDIT FIX #20: AI Usage Tracking Per Tenant
-- Tracks token consumption, costs, and rate limits per org.
-- ================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    function_name TEXT NOT NULL,           -- 'chat-with-ai', 'admin-ai-chat', 'analyze-food', etc.
    model TEXT DEFAULT 'gpt-4o',
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
    metadata JSONB DEFAULT '{}',          -- tool calls, conversation_id, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for tenant billing queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_date ON ai_usage_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_function ON ai_usage_logs (function_name, created_at DESC);

-- Enable RLS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view their org's usage
CREATE POLICY "ai_usage_admin_read" ON ai_usage_logs
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'staff')
        )
    );

-- Service role can insert (edge functions log via service role)
CREATE POLICY "ai_usage_service_insert" ON ai_usage_logs
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Service role can read all
CREATE POLICY "ai_usage_service_read" ON ai_usage_logs
    FOR SELECT USING (auth.role() = 'service_role');

-- ── Helper view for monthly summaries ──────────────────────────

CREATE OR REPLACE VIEW ai_usage_monthly AS
SELECT
    org_id,
    date_trunc('month', created_at) AS month,
    function_name,
    count(*) AS request_count,
    sum(total_tokens) AS total_tokens,
    sum(estimated_cost_usd) AS total_cost_usd
FROM ai_usage_logs
GROUP BY org_id, date_trunc('month', created_at), function_name;
