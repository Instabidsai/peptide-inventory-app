# Self-Healing System — ThePeptideAI

Fully autonomous zero-human-in-the-loop error detection → diagnosis → repair → verification. **READ ALL OF THIS before touching any self-healing code.**

Fix rate: ~100% processing, ~148% fix rate (fixes cascade).

## Architecture

```
Browser (auto-error-reporter.ts, 574 lines)
  ├── Check client_heal_instructions → self-heal locally
  ├── If not healed → write to bug_reports table
  └── Supabase Realtime subscription for live heal instructions

pg_cron (every 2 min) → sentinel-worker (2,440 lines, 16 phases)
  ├── Phase 1: Collect unprocessed bug_reports
  ├── Phase 2: Load error_patterns
  ├── Phase 3: Pattern match (log_only → suppress upgrade)
  ├── Phase 4: AI diagnosis → structured fix_plans
  ├── Phase 5: Execute actions
  ├── Phase 6: Deploy correlation
  ├── Phase 7: Auto-rollback via Vercel API
  ├── Phase 8/8b: Email escalation + retry
  ├── Phase 9: Performance anomaly detection
  ├── Phase 10: Aggregate circuit breakers
  ├── Phase 11: Housekeeping
  ├── Phase 12: Business logic repair (commissions, orders, inventory)
  ├── Phase 13: Schema healer (AI-generated DDL)
  ├── Phase 14: Page availability monitor
  ├── Phase 15: Fix plan executor
  └── Phase 16: Stale incident re-diagnosis

pg_cron (every 30 min) → meta-sentinel (232 lines)
  ├── Compute fix rate (6h rolling window)
  ├── Auto-suppress frequent expected-behavior errors
  ├── Adaptive thresholds (aggressive mode if fix rate < 30%)
  └── Self-repair incident if fix rate < 10%

pg_cron (every 5 min) → health-probe (1,099 lines)
  └── 12 categories, ~40+ health checks

pg_cron (every 5 min) → synthetic-monitor (238 lines)
  └── External content verification + auto-rollback on 2 consecutive failures

On-demand → code-patcher (392 lines)
  └── GitHub: branch → commit → PR → Vercel preview → auto-merge

On-demand → boot-failure (210 lines)
  └── 3+ unique IP crashes in 10min → auto-rollback

Daily (7 AM) → health-digest (594 lines)
  └── HTML health summary email via Resend
```

## Database Tables (17+)

### Core Detection
- `bug_reports` — browser error reports with fingerprinting
- `error_patterns` — pattern matching rules (category, severity, auto_fix_action)
- `health_checks` — probe results (check_name, category, status, latency_ms)

### Incident Tracking
- `incidents` — lifecycle: detected → diagnosing → healing → healed → resolved
- `heal_log` — audit trail of all healing actions
- `sentinel_runs` — run stats (bugs_processed, fixes_applied, etc.)

### Automated Repair
- `fix_plans` — AI-generated repair plans (confidence thresholds: ≥0.7 auto, 0.4-0.7 pending, <0.4 rejected)
- `client_heal_instructions` — push-to-browser healing (suppress/reload/re_auth/clear_cache)
- `code_patches` — GitHub PR tracking (branch, files_changed, deploy_status, auto_merged)
- `schema_heal_log` — DDL repair history

### Safety
- `circuit_breaker_events`, `escalation_log`, `rollback_events`, `deploy_events`
- `performance_baselines`, `sentinel_meta`, `synthetic_checks`

## pg_cron Schedule

```
sentinel-worker:    */2 * * * *    (every 2 min)
meta-sentinel:      */30 * * * *   (every 30 min)
health-probe:       */5 * * * *    (every 5 min)
synthetic-monitor:  */5 * * * *    (every 5 min)
health-digest:      0 7 * * *      (daily 7 AM)
client-heal-cleanup: 0 * * * *     (hourly)
```

## Code-Patcher Safety Controls

- Only touches `src/` files — NEVER supabase/, .github/, config
- Max 500 lines diff, 3 files, 5 patches/day
- Kill switch: `CODE_PATCH_ENABLED` env var
- Every patch stores revert_payload
- Vercel preview must pass before auto-merge

## Client-Side Self-Healing (auto-error-reporter.ts)

```
Error occurs → checkClientHeal(fingerprint)
  → healCache match?
    YES → executeHealInstruction (suppress/re_auth/reload/clear_cache)
    NO  → queueError → batch flush to bug_reports every 5s
```
healCache populated from `client_heal_instructions` on init + Supabase Realtime subscription.

## Env Vars Required

| Var | Used By |
|-----|---------|
| `OPENAI_API_KEY` | sentinel-worker (Phase 4, 13), code-patcher |
| `RESEND_API_KEY` | sentinel-worker (Phase 8) |
| `HEAL_EMAIL` | sentinel-worker (Phase 8) |
| `VERCEL_TOKEN` | sentinel-worker (Phase 7), synthetic-monitor |
| `VERCEL_PROJECT_ID` | sentinel-worker, synthetic-monitor |
| `VERCEL_TEAM_ID` | sentinel-worker, synthetic-monitor |
| `GITHUB_TOKEN` | code-patcher |
| `CODE_PATCH_ENABLED` | code-patcher kill switch |
| `SB_MGMT_TOKEN` | schema-healer |
| `CRON_SECRET` | sentinel-worker (Phase 12) |

## Critical Rules

1. NEVER modify sentinel-worker without reading all 2,440 lines — phases are interdependent
2. NEVER change error_patterns without understanding cascade — drives all downstream phases
3. NEVER remove a table without checking sentinel-worker references (reads/writes 17+ tables)
4. Always use `CREATE TABLE IF NOT EXISTS` in migrations
5. Test changes by manual invoke before relying on cron
