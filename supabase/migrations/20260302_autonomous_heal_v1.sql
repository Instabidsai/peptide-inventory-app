-- =============================================================
-- Autonomous Healing System v1 — Zero Human-in-the-Loop
--
-- Creates: fix_plans, client_heal_instructions, sentinel_meta
-- Extends: bug_reports (fix_plan_id, error_fingerprint, client_healed)
-- Extends: incidents (resolution_method, fix_plan_id)
-- Upgrades: all log_only patterns → suppress (expected behavior)
-- Pre-seeds: client heal instructions for known client-side errors
-- =============================================================

-- ─────────────────────────────────────────────────────
-- 1. fix_plans — Structured AI-generated repair plans
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fix_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id uuid REFERENCES bug_reports(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'unknown',
  fix_type text NOT NULL CHECK (fix_type IN (
    'suppress',            -- Mark as expected behavior, resolve immediately
    'client_instruction',  -- Push heal instruction to browsers
    'config_change',       -- Direct DB config/setting update
    'rpc_call',            -- Call a Supabase RPC function
    'schema_ddl',          -- Delegate to schema healer (Phase 13)
    'code_patch',          -- AI code repair via GitHub API
    'rollback'             -- Deploy rollback via Vercel API
  )),
  fix_payload jsonb NOT NULL DEFAULT '{}',
  ai_confidence float NOT NULL DEFAULT 0.0 CHECK (ai_confidence >= 0.0 AND ai_confidence <= 1.0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Awaiting approval (confidence < threshold)
    'approved',   -- Ready for execution
    'executing',  -- Currently running
    'success',    -- Fix applied successfully
    'failed',     -- Fix attempted but failed
    'reverted',   -- Fix was applied then rolled back
    'rejected'    -- Confidence too low or safety check failed
  )),
  execution_result jsonb,
  revert_payload jsonb,          -- How to undo this fix
  error_fingerprint text,        -- Dedupe key for this error type
  explanation text,              -- AI's reasoning for this fix
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  reverted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fix_plans_status ON fix_plans(status) WHERE status IN ('approved', 'pending');
CREATE INDEX IF NOT EXISTS idx_fix_plans_fingerprint ON fix_plans(error_fingerprint);
CREATE INDEX IF NOT EXISTS idx_fix_plans_created ON fix_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_plans_bug_report ON fix_plans(bug_report_id) WHERE bug_report_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- 2. client_heal_instructions — Push-to-browser repairs
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_heal_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_fingerprint text NOT NULL UNIQUE,
  instruction_type text NOT NULL CHECK (instruction_type IN (
    'suppress',      -- Don't report this error at all
    'reload',        -- Refresh the page
    're_auth',       -- Sign out + redirect to login
    'clear_cache',   -- Clear localStorage/sessionStorage
    'retry'          -- Retry the failed operation once
  )),
  instruction_payload jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  applied_count integer NOT NULL DEFAULT 0,
  max_applies_per_session integer DEFAULT 3,   -- Safety: don't infinite-loop
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_heal_active ON client_heal_instructions(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_client_heal_fingerprint ON client_heal_instructions(error_fingerprint);

-- ─────────────────────────────────────────────────────
-- 3. sentinel_meta — Self-monitoring metrics
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  total_bugs integer NOT NULL DEFAULT 0,
  auto_fixed integer NOT NULL DEFAULT 0,
  suppressed integer NOT NULL DEFAULT 0,
  client_healed integer NOT NULL DEFAULT 0,
  fix_rate float NOT NULL DEFAULT 0.0,
  category_breakdown jsonb DEFAULT '{}',
  top_unresolved jsonb DEFAULT '[]',
  adaptive_actions jsonb DEFAULT '[]',  -- Actions the meta-sentinel took
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_meta_window ON sentinel_meta(window_start DESC);

-- ─────────────────────────────────────────────────────
-- 4. code_patches — Track code-level repairs via GitHub
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_plan_id uuid REFERENCES fix_plans(id) ON DELETE SET NULL,
  github_pr_url text,
  github_pr_number integer,
  branch_name text,
  files_changed jsonb DEFAULT '[]',
  patch_diff text,
  vercel_deployment_url text,
  deploy_status text CHECK (deploy_status IN ('building', 'ready', 'error', 'canceled', 'timeout')),
  tests_passed boolean,
  auto_merged boolean DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_code_patches_fix_plan ON code_patches(fix_plan_id);
CREATE INDEX IF NOT EXISTS idx_code_patches_created ON code_patches(created_at DESC);

-- ─────────────────────────────────────────────────────
-- 5. Extend bug_reports with autonomous heal columns
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'fix_plan_id'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN fix_plan_id uuid REFERENCES fix_plans(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'error_fingerprint'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN error_fingerprint text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bug_reports' AND column_name = 'client_healed'
  ) THEN
    ALTER TABLE bug_reports ADD COLUMN client_healed boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bug_reports_fingerprint ON bug_reports(error_fingerprint) WHERE error_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bug_reports_fix_plan ON bug_reports(fix_plan_id) WHERE fix_plan_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- 6. Extend incidents with autonomous heal columns
-- ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'resolution_method'
  ) THEN
    ALTER TABLE incidents ADD COLUMN resolution_method text;
    -- Values: 'suppress', 'client_heal', 'config_change', 'rpc_call',
    --         'schema_ddl', 'code_patch', 'rollback', 'auto_resolve', 'manual'
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'fix_plan_id'
  ) THEN
    ALTER TABLE incidents ADD COLUMN fix_plan_id uuid REFERENCES fix_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 7. RLS for new tables (admin read, service_role writes)
-- ─────────────────────────────────────────────────────
ALTER TABLE fix_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_heal_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_fix_plans" ON fix_plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_client_heal_instructions" ON client_heal_instructions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Client heal instructions also readable by anon (browsers need to fetch them)
CREATE POLICY "anon_read_active_client_heal" ON client_heal_instructions
  FOR SELECT USING (active = true);

CREATE POLICY "admin_read_sentinel_meta" ON sentinel_meta
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "admin_read_code_patches" ON code_patches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ─────────────────────────────────────────────────────
-- 8. UPGRADE: log_only patterns → suppress
-- These are expected client behaviors, NOT real errors.
-- Instead of silently ignoring them, actively mark them as resolved.
-- ─────────────────────────────────────────────────────

-- Auth errors: normal token/session lifecycle
UPDATE error_patterns
SET auto_fix_action = 'suppress',
    fix_description = fix_description || ' [UPGRADED: suppress — expected client behavior]'
WHERE auto_fix_action = 'log_only'
  AND category = 'auth';

-- Network errors: transient, self-resolving
UPDATE error_patterns
SET auto_fix_action = 'suppress',
    fix_description = fix_description || ' [UPGRADED: suppress — transient network issue]'
WHERE auto_fix_action = 'log_only'
  AND category = 'network';

-- Chunk load errors: deploy artifacts, ErrorBoundary handles
UPDATE error_patterns
SET auto_fix_action = 'suppress',
    fix_description = fix_description || ' [UPGRADED: suppress — stale chunk, self-resolving]'
WHERE auto_fix_action = 'log_only'
  AND pattern IN ('ChunkLoadError', 'Loading chunk .* failed');

-- ResizeObserver: benign browser warning
UPDATE error_patterns
SET auto_fix_action = 'suppress',
    fix_description = fix_description || ' [UPGRADED: suppress — benign browser behavior]'
WHERE auto_fix_action = 'log_only'
  AND pattern = 'ResizeObserver loop';

-- Duplicate key: race condition, self-resolving
UPDATE error_patterns
SET auto_fix_action = 'suppress',
    fix_description = fix_description || ' [UPGRADED: suppress — race condition, self-resolving]'
WHERE auto_fix_action = 'log_only'
  AND pattern = 'duplicate key value violates unique constraint';

-- Also upgrade column does not exist / relation does not exist from create_incident → schema_heal
-- (if they weren't already upgraded by schema_healer migration)
UPDATE error_patterns
SET auto_fix_action = 'schema_heal'
WHERE auto_fix_action = 'create_incident'
  AND pattern IN ('column .* does not exist', 'relation .* does not exist')
  AND auto_fix_action != 'schema_heal';

-- ─────────────────────────────────────────────────────
-- 9. SEED: Client heal instructions for known patterns
-- These tell browsers how to self-heal common errors
-- ─────────────────────────────────────────────────────

INSERT INTO client_heal_instructions (error_fingerprint, instruction_type, instruction_payload, active) VALUES
  -- Auth errors → force re-authentication
  ('refresh_token_not_found', 're_auth', '{"action": "signOut", "redirect": "/auth/login", "message": "Session expired. Please sign in again."}', true),
  ('JWT expired', 're_auth', '{"action": "signOut", "redirect": "/auth/login", "message": "Session expired. Please sign in again."}', true),
  ('Auth session missing', 're_auth', '{"action": "signOut", "redirect": "/auth/login", "message": "Please sign in to continue."}', true),
  ('invalid token', 're_auth', '{"action": "signOut", "redirect": "/auth/login", "message": "Session invalid. Please sign in again."}', true),

  -- Chunk load errors → page reload (deploy artifact mismatch)
  ('ChunkLoadError', 'reload', '{"delay_ms": 500, "message": "Updating to latest version..."}', true),
  ('Loading chunk', 'reload', '{"delay_ms": 500, "message": "Updating to latest version..."}', true),

  -- Network transient → retry once
  ('Failed to fetch', 'retry', '{"max_retries": 1, "delay_ms": 2000}', true),
  ('fetch failed', 'retry', '{"max_retries": 1, "delay_ms": 2000}', true),
  ('NetworkError', 'retry', '{"max_retries": 1, "delay_ms": 3000}', true),

  -- Benign → suppress entirely (don't report)
  ('ResizeObserver loop', 'suppress', '{}', true),
  ('AbortError', 'suppress', '{}', true)

ON CONFLICT (error_fingerprint) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- 10. Realtime: Enable realtime on client_heal_instructions
-- so browsers get live updates when new instructions are added
-- ─────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE client_heal_instructions;

-- ─────────────────────────────────────────────────────
-- 11. Helper function: compute error fingerprint from bug report
-- Normalizes error messages into stable dedupe keys
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_error_fingerprint(error_msg text)
RETURNS text AS $$
DECLARE
  fp text;
BEGIN
  -- Remove UUIDs
  fp := regexp_replace(error_msg, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<UUID>', 'gi');
  -- Remove numbers (IDs, line numbers, etc.)
  fp := regexp_replace(fp, '\b\d{4,}\b', '<NUM>', 'g');
  -- Remove quoted strings
  fp := regexp_replace(fp, '''[^'']*''', '<STR>', 'g');
  fp := regexp_replace(fp, '"[^"]*"', '<STR>', 'g');
  -- Remove file paths
  fp := regexp_replace(fp, '/[^\s]+\.\w+', '<PATH>', 'g');
  -- Collapse whitespace
  fp := regexp_replace(fp, '\s+', ' ', 'g');
  -- Trim
  fp := trim(fp);
  -- Take first 200 chars
  fp := left(fp, 200);

  RETURN fp;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────
-- 12. Helper function: match client heal instruction
-- Used by auto-error-reporter before sending bug reports
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_client_heal(error_msg text)
RETURNS TABLE(
  instruction_type text,
  instruction_payload jsonb,
  error_fingerprint text
) AS $$
  SELECT
    chi.instruction_type,
    chi.instruction_payload,
    chi.error_fingerprint
  FROM client_heal_instructions chi
  WHERE chi.active = true
    AND (chi.expires_at IS NULL OR chi.expires_at > now())
    AND error_msg ILIKE '%' || chi.error_fingerprint || '%'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────
-- 13. pg_cron schedules
-- ─────────────────────────────────────────────────────

-- Client heal instruction cleanup: expire old instructions every hour
-- NOTE: Run manually if pg_cron resets:
-- SELECT cron.schedule('client-heal-cleanup', '0 * * * *',
--   $$UPDATE client_heal_instructions SET active = false WHERE expires_at < now() AND active = true$$
-- );

-- Meta-sentinel: compute fix rate every 30 minutes
-- NOTE: Run manually if pg_cron resets:
-- SELECT cron.schedule('meta-sentinel-30min', '*/30 * * * *', $$
--   SELECT net.http_post(
--     url := '<SUPABASE_URL>/functions/v1/meta-sentinel',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $$);

-- ─────────────────────────────────────────────────────
-- DONE: Summary
-- ─────────────────────────────────────────────────────
-- New tables: fix_plans, client_heal_instructions, sentinel_meta, code_patches
-- Extended: bug_reports (+3 cols), incidents (+2 cols)
-- Upgraded: 11 log_only patterns → suppress
-- Seeded: 11 client heal instructions for auth/chunk/network/benign errors
-- Functions: compute_error_fingerprint(), match_client_heal()
-- Realtime: client_heal_instructions enabled
-- pg_cron: 2 new schedules (commented, run manually)
