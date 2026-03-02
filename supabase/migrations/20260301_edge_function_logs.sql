-- =============================================================
-- edge_function_logs — Request/response logging for all edge functions
-- =============================================================

CREATE TABLE IF NOT EXISTS public.edge_function_logs (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    function_name text NOT NULL,
    method        text NOT NULL DEFAULT 'POST',
    status        int  NOT NULL DEFAULT 200,
    duration_ms   int  NOT NULL DEFAULT 0,
    user_id       uuid,
    org_id        text,
    error_message text,
    request_path  text,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_efl_function_name ON public.edge_function_logs (function_name);
CREATE INDEX IF NOT EXISTS idx_efl_created_at    ON public.edge_function_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_efl_status        ON public.edge_function_logs (status) WHERE status >= 400;
CREATE INDEX IF NOT EXISTS idx_efl_user_id       ON public.edge_function_logs (user_id) WHERE user_id IS NOT NULL;

-- Composite index for latency analysis: function + time window
CREATE INDEX IF NOT EXISTS idx_efl_fn_time ON public.edge_function_logs (function_name, created_at DESC);

-- No RLS — this is an internal observability table written by service role
ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all" ON public.edge_function_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin/super_admin can read (for dashboards)
CREATE POLICY "admin_read" ON public.edge_function_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('admin', 'super_admin')
        )
    );

COMMENT ON TABLE public.edge_function_logs IS 'Request/response log for all edge functions. Auto-pruned after 7 days.';
