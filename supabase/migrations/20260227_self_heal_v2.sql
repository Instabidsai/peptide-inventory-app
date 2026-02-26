-- =============================================================
-- Self-Healing System v2 — Sentinel Brain Tables
-- Powers the autonomous AI sentinel at /vendor/system-health
-- =============================================================

-- 1. error_patterns — Known error signatures with auto-fix mappings
CREATE TABLE IF NOT EXISTS error_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,                          -- regex or substring to match
  match_type text NOT NULL DEFAULT 'substring' CHECK (match_type IN ('substring', 'regex', 'exact')),
  category text NOT NULL DEFAULT 'unknown',       -- 'auth', 'database', 'edge_function', 'network', 'rls', 'validation', 'rate_limit'
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  auto_fix_action text,                           -- null = no auto-fix, else action key
  fix_description text,                           -- human-readable description of the fix
  cooldown_minutes integer NOT NULL DEFAULT 30,   -- minimum minutes between applying this fix
  enabled boolean NOT NULL DEFAULT true,
  times_matched integer NOT NULL DEFAULT 0,
  times_fixed integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  last_fixed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_patterns_enabled ON error_patterns(enabled) WHERE enabled = true;

-- 2. deploy_events — Track deployments for error-deploy correlation
CREATE TABLE IF NOT EXISTS deploy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id text,            -- Vercel deployment ID
  commit_sha text,
  commit_message text,
  branch text,
  status text NOT NULL DEFAULT 'unknown',  -- 'building', 'ready', 'error', 'canceled'
  source text NOT NULL DEFAULT 'vercel',   -- 'vercel', 'supabase', 'manual'
  url text,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_deploy_events_time ON deploy_events(deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_events_status ON deploy_events(status, deployed_at DESC);

-- 3. sentinel_runs — Track sentinel execution history
CREATE TABLE IF NOT EXISTS sentinel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  bugs_processed integer DEFAULT 0,
  patterns_matched integer DEFAULT 0,
  ai_diagnoses integer DEFAULT 0,
  fixes_applied integer DEFAULT 0,
  circuit_breakers_tripped integer DEFAULT 0,
  errors text[],
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_sentinel_runs_time ON sentinel_runs(started_at DESC);

-- 4. Add sentinel tracking column to bug_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'sentinel_processed_at'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN sentinel_processed_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'sentinel_pattern_id'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN sentinel_pattern_id uuid REFERENCES error_patterns(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'sentinel_diagnosis'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN sentinel_diagnosis text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bug_reports_unprocessed
  ON bug_reports(created_at DESC)
  WHERE sentinel_processed_at IS NULL;

-- 5. circuit_breaker_events — Track feature disable/enable by sentinel
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  org_id uuid,                   -- null = all orgs
  action text NOT NULL CHECK (action IN ('tripped', 'reset', 'manual_override')),
  reason text,
  error_count integer,
  threshold integer,
  incident_id uuid REFERENCES incidents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_time ON circuit_breaker_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_feature ON circuit_breaker_events(feature_key, created_at DESC);

-- RLS for new tables
ALTER TABLE error_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_error_patterns" ON error_patterns
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_deploy_events" ON deploy_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_sentinel_runs" ON sentinel_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_circuit_breaker_events" ON circuit_breaker_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ═══════════════════════════════════════════════════════════════
-- 6. SEED: Known error patterns with auto-fix mappings
-- ═══════════════════════════════════════════════════════════════

INSERT INTO error_patterns (pattern, match_type, category, severity, auto_fix_action, fix_description, cooldown_minutes) VALUES

-- Auth errors
('JWT expired', 'substring', 'auth', 'low', 'log_only', 'Normal JWT expiry — user needs to refresh session', 5),
('invalid token', 'substring', 'auth', 'medium', 'log_only', 'Invalid JWT — possible session corruption', 10),
('Auth session missing', 'substring', 'auth', 'low', 'log_only', 'User session expired — normal behavior', 5),
('refresh_token_not_found', 'substring', 'auth', 'medium', 'log_only', 'Refresh token missing — user needs to re-login', 10),

-- Database errors
('violates foreign key constraint', 'substring', 'database', 'high', 'create_incident', 'FK violation — data integrity issue needs investigation', 15),
('duplicate key value violates unique constraint', 'substring', 'database', 'medium', 'log_only', 'Duplicate key — usually a retry or race condition', 10),
('column .* does not exist', 'regex', 'database', 'critical', 'create_incident', 'Missing column — migration may not have run', 5),
('relation .* does not exist', 'regex', 'database', 'critical', 'create_incident', 'Missing table — migration may not have run', 5),
('could not obtain lock', 'substring', 'database', 'high', 'create_incident', 'Database lock contention — possible deadlock', 10),
('statement timeout', 'substring', 'database', 'high', 'create_incident', 'Query timeout — needs optimization', 15),

-- Network / fetch errors
('Failed to fetch', 'substring', 'network', 'medium', 'log_only', 'Network failure — transient, check if widespread', 5),
('fetch failed', 'substring', 'network', 'medium', 'log_only', 'Fetch failure — check connectivity', 5),
('AbortError', 'substring', 'network', 'low', 'log_only', 'Request aborted — usually timeout or navigation', 5),
('NetworkError', 'substring', 'network', 'medium', 'log_only', 'Network error — DNS or connectivity issue', 5),

-- Rate limiting
('429', 'substring', 'rate_limit', 'high', 'circuit_breaker', 'Rate limited — too many requests, circuit breaker should engage', 15),
('rate limit', 'substring', 'rate_limit', 'high', 'circuit_breaker', 'Rate limited — throttle requests', 15),
('Too Many Requests', 'substring', 'rate_limit', 'high', 'circuit_breaker', 'Rate limited — API throttling needed', 15),

-- RLS / Permission errors
('new row violates row-level security', 'substring', 'rls', 'high', 'create_incident', 'RLS policy blocking write — check policy or missing org_id', 10),
('permission denied for table', 'substring', 'rls', 'critical', 'create_incident', 'Permission denied — RLS or role misconfiguration', 5),

-- Edge function errors
('edge_function_error', 'substring', 'edge_function', 'high', 'create_incident', 'Edge function crash — check function logs', 10),
('FunctionsHttpError', 'substring', 'edge_function', 'high', 'create_incident', 'Edge function HTTP error', 10),
('FunctionsRelayError', 'substring', 'edge_function', 'critical', 'create_incident', 'Edge function relay error — Supabase infra issue', 5),

-- Client-side errors
('ChunkLoadError', 'substring', 'network', 'medium', 'log_only', 'Stale chunk after deploy — user needs page refresh', 5),
('Loading chunk .* failed', 'regex', 'network', 'medium', 'log_only', 'Stale chunk — lazyRetry should handle this', 5),
('ResizeObserver loop', 'substring', 'validation', 'low', 'log_only', 'ResizeObserver loop — benign browser warning', 60),

-- OpenAI / AI errors
('openai.*timeout', 'regex', 'edge_function', 'high', 'circuit_breaker', 'OpenAI timeout — AI features should degrade gracefully', 15),
('insufficient_quota', 'substring', 'edge_function', 'critical', 'circuit_breaker', 'OpenAI quota exhausted — disable AI features immediately', 5),
('model_not_found', 'substring', 'edge_function', 'critical', 'create_incident', 'OpenAI model not found — check model name in edge function', 5),

-- Stripe errors
('stripe.*charge.*failed', 'regex', 'validation', 'high', 'create_incident', 'Stripe charge failed — payment issue', 10),
('No such customer', 'substring', 'validation', 'high', 'create_incident', 'Stripe customer not found — sync issue', 10)

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 7. pg_cron schedule for sentinel-worker (every 2 minutes)
-- NOTE: Run manually if pg_cron resets:
-- SELECT cron.schedule('sentinel-worker-2min', '*/2 * * * *', $$
--   SELECT net.http_post(
--     url := '<SUPABASE_URL>/functions/v1/sentinel-worker',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $$);
-- ═══════════════════════════════════════════════════════════════
