-- =============================================================
-- Self-Healing System v3 — Enhanced Monitoring Tables
-- Adds: performance baselines, escalation tracking, resource metrics
-- =============================================================

-- 1. performance_baselines — Rolling averages for anomaly detection
CREATE TABLE IF NOT EXISTS performance_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  avg_latency_ms numeric NOT NULL DEFAULT 0,
  p95_latency_ms numeric NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  window_hours integer NOT NULL DEFAULT 24,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(check_name, window_hours)
);

CREATE INDEX IF NOT EXISTS idx_perf_baselines_name ON performance_baselines(check_name);

-- 2. resource_metrics — DB size, connections, cache hit ratio snapshots
CREATE TABLE IF NOT EXISTS resource_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,       -- 'db_size_mb', 'active_connections', 'cache_hit_ratio', 'dead_tuples', 'index_usage_ratio'
  metric_value numeric NOT NULL,
  threshold_warning numeric,       -- yellow alert threshold
  threshold_critical numeric,      -- red alert threshold
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'critical')),
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_metrics_time ON resource_metrics(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_name ON resource_metrics(metric_name, checked_at DESC);

-- 3. escalation_log — Track when emails were sent for incidents
CREATE TABLE IF NOT EXISTS escalation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'dashboard', 'webhook')),
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'suppressed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalation_log_incident ON escalation_log(incident_id);
CREATE INDEX IF NOT EXISTS idx_escalation_log_time ON escalation_log(created_at DESC);

-- 4. rollback_events — Track auto-rollback attempts
CREATE TABLE IF NOT EXISTS rollback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_event_id uuid REFERENCES deploy_events(id),
  incident_id uuid REFERENCES incidents(id),
  rollback_to_deployment_id text,  -- Vercel deployment ID to rollback to
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  reason text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollback_events_time ON rollback_events(created_at DESC);

-- 5. Add escalation tracking columns to incidents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'escalation_sent_at'
  ) THEN
    ALTER TABLE incidents ADD COLUMN escalation_sent_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'rollback_attempted'
  ) THEN
    ALTER TABLE incidents ADD COLUMN rollback_attempted boolean DEFAULT false;
  END IF;
END $$;

-- 6. RLS for new tables (admin-only read)
ALTER TABLE performance_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_performance_baselines" ON performance_baselines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_resource_metrics" ON resource_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_escalation_log" ON escalation_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_rollback_events" ON rollback_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- 7. Seed resource metric thresholds reference
-- (These are used by health-probe to determine status)
COMMENT ON TABLE resource_metrics IS 'Thresholds: db_size_mb(warn:450,crit:480), active_connections(warn:80,crit:95), cache_hit_ratio(warn:0.95,crit:0.90), dead_tuples(warn:50000,crit:100000), index_usage_ratio(warn:0.90,crit:0.80)';
