-- Schema Healer: Autonomous DDL fix capability for sentinel Phase 13
-- Adds schema_heal_log table, updates error_patterns, extends sentinel_runs

-- 1. Schema heal audit log
CREATE TABLE IF NOT EXISTS schema_heal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id uuid REFERENCES bug_reports(id),
  error_fingerprint text NOT NULL,
  error_message text NOT NULL,
  generated_sql text NOT NULL,
  explanation text,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  pre_state jsonb,
  execution_result text NOT NULL DEFAULT 'pending' CHECK (execution_result IN ('pending', 'success', 'failed', 'skipped', 'blocked')),
  execution_error text,
  verification_result text CHECK (verification_result IN ('verified', 'failed', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_schema_heal_log_fingerprint ON schema_heal_log(error_fingerprint);
CREATE INDEX IF NOT EXISTS idx_schema_heal_log_created ON schema_heal_log(created_at DESC);

ALTER TABLE schema_heal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_schema_heal_log" ON schema_heal_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- 2. Add schema_fixes_applied to sentinel_runs
ALTER TABLE sentinel_runs ADD COLUMN IF NOT EXISTS schema_fixes_applied integer DEFAULT 0;

-- 3. Add sentinel_schema_healed to bug_reports (Phase 13 tracking)
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS sentinel_schema_healed text;

-- 4. Update error_patterns: schema errors should route to schema_heal
UPDATE error_patterns SET auto_fix_action = 'schema_heal'
WHERE pattern IN ('column .* does not exist', 'relation .* does not exist');

NOTIFY pgrst, 'reload schema';
