-- ============================================================
-- Migration: Phase 14 Page Availability Monitor + v2 Error Patterns
-- Date: 2026-02-27
-- ============================================================

-- 1. Add pages_circuit_broken column to sentinel_runs
ALTER TABLE sentinel_runs ADD COLUMN IF NOT EXISTS pages_circuit_broken integer DEFAULT 0;

-- 2. Ensure incidents table has resolved_at and resolution_notes columns
-- (may already exist; IF NOT EXISTS makes this safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'resolved_at') THEN
    ALTER TABLE incidents ADD COLUMN resolved_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'resolution_notes') THEN
    ALTER TABLE incidents ADD COLUMN resolution_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'details') THEN
    ALTER TABLE incidents ADD COLUMN details jsonb;
  END IF;
END $$;

-- 3. New error_patterns for v2 AutoErrorReporter sources
-- These let Phase 3 immediately match without needing AI diagnosis.

-- Dead click (from click-tracker.ts)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Dead click.*no response',
  'regex',
  'medium',
  'create_incident',
  'User clicked interactive element with no response. Likely broken event handler or missing navigation.',
  true,
  'dead_click'
)
ON CONFLICT DO NOTHING;

-- Rage click (from click-tracker.ts)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Rage click.*\\dx in',
  'regex',
  'high',
  'create_incident',
  'User rage-clicked element multiple times. Strong signal of broken UI element causing user frustration.',
  true,
  'rage_click'
)
ON CONFLICT DO NOTHING;

-- Slow fetch (from auto-error-reporter v2)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Slow fetch.*ms:',
  'regex',
  'low',
  'log_only',
  'API call exceeded 5-second threshold. May indicate database query optimization needed or network issues.',
  true,
  'slow_fetch'
)
ON CONFLICT DO NOTHING;

-- Network error (from auto-error-reporter v2)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Network error:.*fetch',
  'regex',
  'high',
  'create_incident',
  'Fetch failed with network error (DNS, timeout, CORS, or connection refused). Service may be down.',
  true,
  'network_error'
)
ON CONFLICT DO NOTHING;

-- External fetch error (from auto-error-reporter v2)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'External API error.*5[0-9][0-9]',
  'regex',
  'medium',
  'create_incident',
  'External (non-Supabase) API returned 5xx server error. Third-party service issue.',
  true,
  'external_fetch_error'
)
ON CONFLICT DO NOTHING;

-- Poor Web Vital (from auto-error-reporter v2 + web-vitals bridge)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Poor Web Vital:',
  'substring',
  'low',
  'log_only',
  'Core Web Vital scored "poor". CLS>0.25, LCP>4s, INP>500ms, FID>300ms, or TTFB>1800ms.',
  true,
  'poor_web_vital'
)
ON CONFLICT DO NOTHING;

-- Long task (from auto-error-reporter v2)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Long task.*ms blocking',
  'regex',
  'low',
  'log_only',
  'JavaScript main thread blocked for >200ms. May cause UI jank and poor INP scores.',
  true,
  'long_task'
)
ON CONFLICT DO NOTHING;

-- Schema drift (from health-probe v5 section 11)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Schema drift.*missing column',
  'regex',
  'critical',
  'schema_heal',
  'Health-probe detected missing column in critical table. Sentinel Phase 13 will attempt DDL fix.',
  true,
  'schema_drift'
)
ON CONFLICT DO NOTHING;

-- Sentinel stale (from health-probe v5 section 12)
INSERT INTO error_patterns (pattern, match_type, severity, auto_fix_action, fix_description, enabled, source_filter)
VALUES (
  'Sentinel.*stale.*no run',
  'regex',
  'critical',
  'create_incident',
  'Sentinel worker has not run in 10+ minutes. Cron job may be dead or edge function failing.',
  true,
  NULL
)
ON CONFLICT DO NOTHING;

-- Add source_filter column to error_patterns if it doesn't exist
-- This lets patterns match ONLY bugs from specific sources (dead_click, rage_click, etc.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'error_patterns' AND column_name = 'source_filter') THEN
    ALTER TABLE error_patterns ADD COLUMN source_filter text;
    COMMENT ON COLUMN error_patterns.source_filter IS 'If set, pattern only matches bugs where console_errors->source equals this value';
  END IF;
END $$;

-- Index for faster pattern lookups by source
CREATE INDEX IF NOT EXISTS idx_error_patterns_source_filter ON error_patterns(source_filter) WHERE source_filter IS NOT NULL;

-- Index for faster Phase 14 page aggregation
CREATE INDEX IF NOT EXISTS idx_bug_reports_page_url_created ON bug_reports(page_url, created_at DESC) WHERE page_url IS NOT NULL;
