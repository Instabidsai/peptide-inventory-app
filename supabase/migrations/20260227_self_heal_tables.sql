-- =============================================================
-- Self-Healing System Tables
-- Powers the autonomous monitoring dashboard at /admin/health
-- =============================================================

-- 1. health_checks: probe results from automated health probes
CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,               -- 'database', 'auth_service', 'rpc:get_inventory_valuation', 'edge:chat-with-ai', 'app_url'
  category text NOT NULL DEFAULT 'infra',  -- 'infra', 'rpc', 'edge', 'app'
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  latency_ms integer,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_name_time ON health_checks(check_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_status_time ON health_checks(status, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at DESC);

-- 2. incidents: tracked issues through detection → healing → resolution
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'diagnosing', 'healing', 'healed', 'resolved', 'failed')),
  source text,                             -- 'health_probe', 'bug_report', 'error_reporter', 'sentinel'
  error_pattern text,
  diagnosis text,
  auto_healed boolean DEFAULT false,
  heal_action text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  diagnosed_at timestamptz,
  healed_at timestamptz,
  resolved_at timestamptz,
  related_bug_report_ids uuid[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_time ON incidents(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity, detected_at DESC);

-- 3. heal_log: record of each healing action
CREATE TABLE IF NOT EXISTS heal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  action text NOT NULL,                    -- 'pattern_match', 'auto_fix', 'rollback', 'deploy_check', 'sentinel_heal'
  result text NOT NULL CHECK (result IN ('success', 'failure', 'skipped')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heal_log_incident ON heal_log(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heal_log_time ON heal_log(created_at DESC);

-- RLS: admins can read, service_role bypasses RLS for writes
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE heal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_health_checks" ON health_checks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_incidents" ON incidents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_heal_log" ON heal_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- 4. Helper function for health-probe RPC existence checks
CREATE OR REPLACE FUNCTION check_functions_exist(function_names text[])
RETURNS TABLE(routine_name text) AS $$
  SELECT r.routine_name::text
  FROM information_schema.routines r
  WHERE r.routine_schema = 'public'
    AND r.routine_type = 'FUNCTION'
    AND r.routine_name = ANY(function_names);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. pg_cron schedule for health-probe (every 5 minutes)
-- NOTE: Run manually if pg_cron resets:
-- SELECT cron.schedule('health-probe-5min', '*/5 * * * *', $$
--   SELECT net.http_post(
--     url := 'https://mckkegmkpqdicudnfhor.supabase.co/functions/v1/health-probe',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $$);
