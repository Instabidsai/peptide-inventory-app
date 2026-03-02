-- Boot Monitoring: external + browser crash detection + auto-rollback audit trail
-- Catches the class of failure where JS crashes at module scope and the entire
-- React app never mounts (black page), which is invisible to Sentry, ErrorBoundary,
-- and the auto-error-reporter since they all require React to load first.

-- 1. Browser crash reports from the inline boot sentinel in index.html
CREATE TABLE IF NOT EXISTS boot_failures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    url text NOT NULL,
    user_agent text,
    errors jsonb DEFAULT '[]'::jsonb,        -- [{msg, file, line, col}]
    client_ip text,
    boot_timeout_ms int DEFAULT 15000,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_boot_failures_created ON boot_failures (created_at DESC);

-- 2. External synthetic monitor results
CREATE TABLE IF NOT EXISTS synthetic_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    url text NOT NULL,
    http_status int,
    has_content boolean DEFAULT false,       -- did the page have real rendered content?
    content_marker text,                     -- what marker was checked
    response_time_ms int,
    error text,
    passed boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_synthetic_checks_created ON synthetic_checks (created_at DESC);
CREATE INDEX idx_synthetic_checks_passed ON synthetic_checks (passed, created_at DESC);

-- 3. Auto-rollback audit trail
CREATE TABLE IF NOT EXISTS deployment_rollbacks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_source text NOT NULL,            -- 'boot_sentinel' | 'synthetic_monitor' | 'github_action'
    failed_deployment_url text,
    rollback_deployment_id text,             -- Vercel deployment ID we rolled back to
    rollback_deployment_url text,
    reason text,
    consecutive_failures int DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- No RLS on monitoring tables — these are system-level, not tenant-scoped.
-- Edge functions authenticate via service role key.
ALTER TABLE boot_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_rollbacks ENABLE ROW LEVEL SECURITY;

-- Service role has full access (edge functions use service role)
CREATE POLICY "service_role_boot_failures" ON boot_failures FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY "service_role_synthetic_checks" ON synthetic_checks FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY "service_role_deployment_rollbacks" ON deployment_rollbacks FOR ALL
    USING (auth.role() = 'service_role');

-- Also allow anon INSERT on boot_failures (browser sends reports without auth)
CREATE POLICY "anon_insert_boot_failures" ON boot_failures FOR INSERT
    WITH CHECK (true);

-- Cleanup: auto-delete old records (keep 30 days)
-- If pg_cron is available, schedule it. Otherwise this is a reference for manual cleanup.
DO $$
BEGIN
    PERFORM cron.schedule(
        'cleanup-boot-monitoring',
        '0 3 * * *',
        $$DELETE FROM boot_failures WHERE created_at < now() - interval '30 days';
          DELETE FROM synthetic_checks WHERE created_at < now() - interval '30 days';$$
    );
EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available — skip scheduled cleanup';
END $$;
