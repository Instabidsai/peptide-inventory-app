# Self-Healing System — Complete Architecture Reference

**Agents: READ THIS BEFORE touching ANY self-healing code.**
This documents the ENTIRE autonomous self-healing system — not just sentinel-worker, but all components across the codebase.

---

## System Overview

A fully autonomous zero-human-in-the-loop error detection and repair system. Errors flow from browsers → Supabase → sentinel-worker → automated fix → verified resolution.

**Fix rate target: 95%+ | Current: ~100% processing, ~148% fix rate (fixes cascade across multiple bugs)**

### Architecture Diagram

```
Browser (auto-error-reporter.ts)
  ├── Check client_heal_instructions → self-heal locally (suppress/reload/re_auth/clear_cache)
  ├── If not healed → write to bug_reports table
  └── Supabase Realtime subscription for live heal instructions

Supabase pg_cron (every 2 min)
  └── sentinel-worker (16 phases) ← THE MAIN ENGINE
        ├── Phase 1: Collect unprocessed bug_reports
        ├── Phase 2: Load error_patterns
        ├── Phase 3: Pattern match (log_only → suppress upgrade)
        ├── Phase 4: AI diagnosis → structured fix_plans (createFixPlan)
        ├── Phase 5: Execute actions (suppress/client_instruction/create_incident/circuit_breaker/disable_feature/schema_heal)
        ├── Phase 6: Deploy correlation (bugs after deploy = rollback candidate)
        ├── Phase 7: Auto-rollback via Vercel API
        ├── Phase 8: Email escalation via Resend API
        ├── Phase 8b: Retry failed escalations
        ├── Phase 9: Performance anomaly detection
        ├── Phase 10: Aggregate circuit breakers (disable features if errors spike)
        ├── Phase 11: Housekeeping (resolve stale incidents, prune old data)
        ├── Phase 12: Business logic auto-repair (commissions, orphaned orders, negative credits)
        ├── Phase 13: Autonomous schema healer (AI-generated DDL via Management API)
        ├── Phase 14: Page availability monitor
        ├── Phase 15: Fix plan executor (execute approved fix_plans)
        └── Phase 16: Stale incident re-diagnosis

Supabase pg_cron (every 30 min)
  └── meta-sentinel
        ├── Compute fix rate over 6h rolling window
        ├── Auto-suppress frequent expected-behavior errors
        ├── Create client_heal_instructions for browser-side suppression
        ├── Adaptive thresholds (lower confidence → more aggressive when fix rate drops)
        └── Self-repair incident if fix rate < 10%

On-demand (triggered by Phase 15)
  └── code-patcher
        ├── Fetch source file from GitHub Contents API
        ├── AI generates search/replace patch
        ├── Create branch auto-fix/{fingerprint}
        ├── Commit + PR with [auto-fix] prefix
        ├── Poll Vercel preview deployment
        └── Auto-merge on success, close PR on failure

Supabase pg_cron (every 5 min)
  └── health-probe (v28)
        ├── Database connectivity
        ├── Auth service
        ├── RPC functions
        ├── Edge function availability
        └── App URL check

External monitoring
  ├── synthetic-monitor (edge function, DEPLOYED but NO cron — manual trigger only)
  │     └── Fetches app.thepeptideai.com, checks content markers, auto-rollback on 2 consecutive failures
  ├── boot-failure (edge function, receives boot sentinel crash reports)
  │     └── Browser's inline <script> in index.html catches module-scope crashes
  └── GitHub Actions uptime-monitor (every 5 min via .github/workflows/uptime-monitor.yml)
        └── HTTP + content check + Supabase connectivity + auto-rollback via Vercel API
```

---

## All Files

### Edge Functions (supabase/functions/)

| File | Lines | Purpose | Deployed | Version | Cron |
|------|-------|---------|----------|---------|------|
| `sentinel-worker/index.ts` | 2,440 | 17-phase self-healing engine (16 + 8b) | YES | v4 | `*/2 * * * *` |
| `meta-sentinel/index.ts` | 232 | Self-monitoring + adaptive thresholds | YES | v5 | `*/30 * * * *` |
| `code-patcher/index.ts` | 392 | GitHub API code repair | YES | v5 | On-demand |
| `health-probe/index.ts` | 1,099 | Infrastructure health checks (40+ checks, 12 categories) | YES | v4+ | `*/5 * * * *` |
| `synthetic-monitor/index.ts` | 237 | External content verification | YES | v2 | **NONE** |
| `boot-failure/index.ts` | 210 | Receives boot sentinel crash reports + auto-rollback (3+ unique IPs in 10min) | YES | v2 | On-demand |
| `health-digest/index.ts` | 594 | Daily health summary email (7 sections, HTML, via Resend) | YES | v9 | `0 7 * * *` |
| `_shared/schema-healer.ts` | 181 | SQL safety validation + Management API DDL | N/A (shared) | — | — |
| `_shared/error-reporter.ts` | 107 | Edge function error wrapper → bug_reports | N/A (shared) | — | — |

### Frontend (src/)

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/auto-error-reporter.ts` | 574 | Client-side error capture + self-healing |
| `index.html` | — | Boot sentinel `<script>` catches module-scope crashes |

### Migrations (supabase/migrations/)

| File | Creates |
|------|---------|
| `20260227_self_heal_tables.sql` | health_checks, incidents, heal_log + RLS + check_functions_exist() |
| `20260227_self_heal_v2.sql` | bug_reports extensions, error_patterns, sentinel_runs, escalation_log, circuit_breaker_events, deploy_events, rollback_events, performance_baselines |
| `20260227_self_heal_v3.sql` | schema_heal_log, sentinel-worker config constants |
| `20260227_schema_healer.sql` | Schema healer support tables |
| `20260302_autonomous_heal_v1.sql` | fix_plans, client_heal_instructions, sentinel_meta, code_patches + extends bug_reports + extends incidents |
| `20260302_boot_monitoring.sql` | synthetic_checks, deployment_rollbacks, boot_crash_reports |

### Other

| File | Purpose |
|------|---------|
| `SELF-HEALING-MASTERPLAN.md` | 5-layer system design document (456 lines) |
| `.github/workflows/uptime-monitor.yml` | External GitHub Actions uptime monitor |

---

## All Database Tables (17 tables)

### Core Detection

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `bug_reports` | Browser error reports | id, description, console_errors, page_url, org_id, sentinel_processed_at, sentinel_diagnosis, sentinel_pattern_id, sentinel_schema_healed, fix_plan_id, error_fingerprint, client_healed |
| `error_patterns` | Pattern matching rules | id, pattern, category, severity, auto_fix_action, fix_description, times_matched |
| `health_checks` | Probe results | check_name, category, status (pass/fail), latency_ms, error_message |

### Incident Tracking

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `incidents` | Issue lifecycle tracking | id, title, severity, status (detected→diagnosing→healing→healed→resolved→failed), source, error_pattern, diagnosis, auto_healed, heal_action, resolution_method, fix_plan_id |
| `heal_log` | Audit trail of healing actions | action, result (success/failure/skipped), details |
| `sentinel_runs` | Run history with stats | bugs_processed, patterns_matched, ai_diagnoses, fixes_applied, circuit_breakers_tripped, schema_fixes_applied |

### Automated Repair

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `fix_plans` | AI-generated repair plans | fix_type (suppress/client_instruction/config_change/rpc_call/schema_ddl/code_patch/rollback), fix_payload, ai_confidence, status (pending→approved→executing→success/failed/reverted/rejected), revert_payload |
| `client_heal_instructions` | Push-to-browser self-healing | error_fingerprint (unique), instruction_type (suppress/reload/re_auth/clear_cache/retry), active, expires_at, applied_count |
| `code_patches` | GitHub code repair tracking | fix_plan_id, github_pr_url, branch_name, files_changed, deploy_status, auto_merged |
| `schema_heal_log` | Schema DDL repair history | error_fingerprint, sql_executed, execution_result |

### Safety Systems

| Table | Purpose |
|-------|---------|
| `circuit_breaker_events` | Feature disable/reset events |
| `escalation_log` | Email escalation tracking |
| `rollback_events` | Auto-rollback via Vercel API |
| `deploy_events` | Deployment tracking for correlation |
| `performance_baselines` | Latency baselines for anomaly detection |

### Monitoring

| Table | Purpose |
|-------|---------|
| `sentinel_meta` | Self-monitoring metrics (fix_rate, category_breakdown, adaptive_actions) |
| `synthetic_checks` | External synthetic monitor results |
| `deployment_rollbacks` | Rollback history from synthetic-monitor |

---

## pg_cron Schedules (7 active)

```sql
-- Core self-healing
sentinel-worker-2min:       */2 * * * *   → sentinel-worker edge function
meta-sentinel-30min:        */30 * * * *  → meta-sentinel edge function
health-probe-5min:          */5 * * * *   → health-probe edge function
synthetic-monitor-5min:     */5 * * * *   → synthetic-monitor edge function (added 2026-03-02)

-- Cleanup
client-heal-cleanup-hourly: 0 * * * *    → SQL: expire stale client_heal_instructions

-- Daily
health-digest-daily:        0 7 * * *    → health-digest edge function
check-low-supply-daily:     0 13 * * *   → check-low-supply edge function
```

---

## Key Environment Variables (Supabase Edge Function Secrets)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | sentinel-worker (Phase 4, 13), code-patcher | AI diagnosis + fix plan generation |
| `RESEND_API_KEY` | sentinel-worker (Phase 8) | Email escalation |
| `HEAL_EMAIL` | sentinel-worker (Phase 8) | Escalation recipient |
| `VERCEL_TOKEN` | sentinel-worker (Phase 7), synthetic-monitor | Auto-rollback |
| `VERCEL_PROJECT_ID` | sentinel-worker, synthetic-monitor | Identify Vercel project |
| `VERCEL_TEAM_ID` | sentinel-worker, synthetic-monitor | Vercel team scope |
| `GITHUB_TOKEN` | code-patcher | GitHub API (branch/commit/PR/merge) |
| `GITHUB_REPO_OWNER` | code-patcher | Default: `Instabidsai` |
| `GITHUB_REPO_NAME` | code-patcher | Default: `peptide-inventory-app` |
| `CODE_PATCH_ENABLED` | code-patcher | Kill switch for code repairs |
| `SB_MGMT_TOKEN` | schema-healer | Supabase Management API for DDL |
| `CRON_SECRET` | sentinel-worker (Phase 12) | Auth for internal edge function calls |

---

## Sentinel-Worker 16 Phases — Quick Reference

| Phase | What It Does | Tables Read | Tables Written |
|-------|-------------|-------------|----------------|
| 1 | Collect unprocessed bugs | bug_reports | sentinel_runs |
| 2 | Load error patterns | error_patterns | — |
| 3 | Pattern match + log_only→suppress | bug_reports, error_patterns | bug_reports (mark processed) |
| 4 | AI structured diagnosis | bug_reports | fix_plans |
| 5 | Execute actions | fix_plans | bug_reports, incidents, client_heal_instructions, org_features |
| 6 | Deploy correlation | deploy_events, bug_reports | incidents |
| 7 | Auto-rollback | incidents, deploy_events | rollback_events, heal_log |
| 8 | Email escalation | incidents | escalation_log |
| 8b | Retry failed escalations | escalation_log, incidents | escalation_log, heal_log |
| 9 | Performance anomaly | performance_baselines, health_checks | incidents, heal_log |
| 10 | Aggregate circuit breakers | bug_reports, error_patterns | org_features, circuit_breaker_events |
| 11 | Housekeeping | incidents, sentinel_runs, etc. | (cleanup/resolve) |
| 12 | Business logic repair | health_checks, sales_orders, commissions, profiles, bottles | (targeted fixes), heal_log |
| 13 | Schema healer | bug_reports, schema_heal_log | schema_heal_log, bug_reports |
| 14 | Page availability | (external fetch) | incidents |
| 15 | Fix plan executor | fix_plans | fix_plans, bug_reports, incidents |
| 16 | Stale incident re-diagnosis | incidents | incidents, fix_plans |

---

## Fix Plan Confidence Thresholds

| Confidence | Action |
|------------|--------|
| >= 0.7 | Auto-approved, executed immediately |
| 0.4 - 0.7 | Queued as 'pending', may be promoted by meta-sentinel |
| < 0.4 | Rejected |

Meta-sentinel adaptive override: if fix_rate < 30% for 3 windows → lower threshold to 0.4 (aggressive mode).

---

## Code-Patcher Safety Controls

- Only touches files in `src/` — NEVER `supabase/`, `.github/`, config files
- Max 500 lines diff per patch
- Max 3 files per patch
- Max 5 code patches per day (`MAX_CODE_PATCHES_PER_DAY`)
- Kill switch: `CODE_PATCH_ENABLED` env var (must be "true")
- Every patch stores revert_payload (previous file content)
- Vercel preview must pass before auto-merge

---

## Client-Side Self-Healing Flow (auto-error-reporter.ts)

```
Error occurs in browser
  ↓
checkClientHeal(errorFingerprint)
  ↓
healCache has matching instruction?
  ├── YES → executeHealInstruction()
  │         ├── suppress: swallow error, don't report
  │         ├── re_auth: sign out + redirect to /login
  │         ├── reload: location.reload() (with 1x guard)
  │         └── clear_cache: localStorage.clear() + reload
  │
  └── NO → queueError() → batch flush to bug_reports every 5s
```

The healCache is populated on init from `client_heal_instructions` table (active=true) and kept live via Supabase Realtime subscription.

---

## Known Gaps — ALL RESOLVED (2026-03-02)

1. ~~synthetic-monitor has no cron job~~ — **FIXED**: `synthetic-monitor-5min` cron added (jobid 10, `*/5 * * * *`)
2. ~~Missing `error_log` table~~ — **FIXED**: Created with RLS policy
3. ~~meta-sentinel and code-patcher missing `config.toml`~~ — **FIXED**: Both created with `verify_jwt = false`
4. **Env vars** — all confirmed working via live sentinel runs (OPENAI_API_KEY, RESEND_API_KEY, VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID present; GITHUB_TOKEN + CODE_PATCH_ENABLED needed only if code-patcher is enabled)

---

## CRITICAL RULES

1. **NEVER modify sentinel-worker without reading ALL 2,440 lines first.** Phases are interdependent.
2. **NEVER change error_patterns without understanding cascade.** Patterns drive Phase 3 matching which drives ALL downstream phases.
3. **NEVER remove a table without checking sentinel-worker references.** It reads/writes 17+ tables.
4. **ALWAYS use `CREATE TABLE IF NOT EXISTS` and `DO $$ ... IF NOT EXISTS` in migrations.** The system has layered migrations that may re-run.
5. **config.toml is required for every edge function** (`verify_jwt = false`). Auth is in code via `_shared/auth.ts`.
6. **Test sentinel-worker changes by invoking manually** before relying on cron: `POST https://mckkegmkpqdicudnfhor.supabase.co/functions/v1/sentinel-worker`

---

## Agent Notes
_Add discoveries here as you work on the self-healing system._
<!-- agents: append findings below with date -->

### 2026-03-02 — End-to-end verification complete
- All 7 pg_cron jobs active (synthetic-monitor added)
- error_log table created (was missing, referenced by Phase 12 fallback)
- config.toml added to meta-sentinel + code-patcher dirs
- Test: inserted fake "Auth session missing" bug → sentinel processed in <2min → Phase 3 pattern match → auto-suppress → client_healed=true → heal_log audit trail recorded
- Synthetic monitor confirmed: app.thepeptideai.com passing (HTTP 200, content marker present, 74ms)
- System vitals: 0 unprocessed bugs, 155% fix rate, 2,754 sentinel runs, 12 active client heal instructions
- sentinel-worker auth: cron uses service role key as Bearer token (NOT cron secret — the function accepts both)

### 2026-03-03 — Full audit confirms everything built
- sentinel-worker: 2,440 lines, 17 phases (1-16 + 8b), all working
- health-probe: 1,099 lines, 12 check categories, ~40+ individual checks
- health-digest: 594 lines, 7 data sections, HTML email via Resend
- auto-error-reporter: 574 lines, client-side self-healing with Realtime subscription CONFIRMED
- All 4 Phase A-E tables exist: fix_plans, client_heal_instructions (11 pre-seeded + Realtime), sentinel_meta, code_patches
- meta-sentinel: 231 lines, adaptive thresholds, self-repair incidents
- code-patcher: 392 lines, full GitHub API flow (branch → commit → PR → Vercel preview → auto-merge)
- boot-failure: 210 lines, auto-rollback after 3+ unique IP crashes in 10 min
- synthetic-monitor: 238 lines, content verification + auto-rollback on 2 consecutive failures
- FeedbackHub "Auto-Heal" button: inserts into bug_reports → sentinel picks up in <2min → full pipeline
