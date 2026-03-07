# scripts/ — Operational Scripts Directory

Operational scripts for deploy, DB migration, self-healing, debugging, testing, and one-off fixes.
All scripts target Supabase project `mckkegmkpqdicudnfhor`.

---

## Deploy & CI

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| **`deploy.mjs`** ⭐ | Full deploy pipeline: tests → preflight → SQL migrations → git push → validation | Yes | Flags: `--skip-tests`, `--skip-migrations`, `--dry-run`, `--migrate-only`, `--message=` |
| `deploy-edge-functions.mjs` | Deploys all Supabase edge functions | Yes | Use `supabase functions deploy X` for single function |
| `deploy-functions.mjs` | Alternate edge function deployer | Yes | |
| `deploy_critical_fixes.mjs` | Emergency fix deploy — bypasses normal pipeline | Caution | Use only for hotfixes |
| **`bump-version.mjs`** ⭐ | Bumps version in `package.json` + `index.html` together | Yes | Args: `patch` / `minor` / `major` |
| `validate-deployment.ts` | Post-deploy health checks | Yes | Called automatically by `deploy.mjs` |
| `verify_deployment_final.ts` | Final verification of a deploy | Yes | |

---

## Database & Schema

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| **`schema-master.sql`** ⭐ | Full DB schema from scratch: 57 tables, 569 columns, ~120 RLS policies | Idempotent | Generated 2026-02-22 from prod. Run against fresh Supabase project only. |
| `seed-demo-data.sql` | Seeds demo tenant data | No | Use on fresh/test DBs only |
| `seed-new-tenant.sql` | Provisions a new tenant org | Caution | Creates org rows — check for duplicates first |
| `seed-subscription-plans.sql` | Seeds Stripe subscription plan rows | Caution | Check existing rows first |
| `setup-database.ts` | Initializes DB structure for a new environment | No | One-time setup |
| `run_sql.ts` | Generic SQL runner via Supabase client | Yes | |
| `run_ddl.ts` | Executes DDL statements directly | Caution | |
| `tables_only.sql` | Schema with tables only — no functions/triggers/policies | Idempotent | Reference only |
| `current_schema_check.sql` | Read-only schema inspection query | Yes | |
| `dump_complete_schema.ts` | Dumps live schema to file | Yes | |
| `20260123_*.sql` … `20260224_*.sql` | Dated incremental migrations | Idempotent | Applied via `deploy.mjs --migrate-only` |
| `REQUIRED_*.sql` | Mandatory one-time migration blocks (Phase 3/4/8) | No | Applied once per env |

---

## Self-Healing

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| **`auto-heal.mjs`** ⭐ | 4-phase pipeline: detect → Claude Code repair → verify → email report | Yes | Reads `audit_log`; uses `--dangerously-skip-permissions`; see `specs/self-healing.md` |
| `auto-heal-sentinel.mjs` | Long-running sentinel that schedules `auto-heal.mjs` on a cron | Yes | Wraps `auto-heal.mjs` in a loop |
| `test-auto-heal.mjs` | Smoke test for the auto-heal pipeline | Yes | |
| `auto-heal-scheduled.cmd` | Windows Task Scheduler launcher for sentinel | — | Windows CMD wrapper |
| `sentinel-service.cmd` | Windows service wrapper for sentinel | — | |
| `start-sentinel.cmd` | One-click sentinel start | — | |
| `install-sentinel-startup.ps1` | Registers sentinel as Windows startup task | Once | PowerShell — run as admin |

---

## Debug & Diagnostics

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| `debug_*.ts` | Point-in-time DB/env/schema inspection | Yes | Read-only; safe to run anytime |
| `diagnose_*.ts` | Targeted diagnostics for specific subsystems | Yes | |
| `check_*.ts` | Column / constraint / policy / enum checks | Yes | Read-only |
| `audit_*.ts` | Inventory, order, lot, and org audits | Yes | |
| `verify_*.ts` | Post-migration / post-fix verification | Yes | |
| `_query_data.mjs` | Raw query scratchpad | Yes | |
| `analyze_*.ts` | Financial / data analysis queries | Yes | |
| `debug_kpv_query.sql` | KPV debug SQL | Yes | |

---

## Data Seeding & User Setup

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| `create_test_user.ts` / `create_test_customer.ts` | Creates test users in Supabase Auth | No | Check for existing users first |
| `create_admin_user.ts` / `create_client_user.ts` | Creates role-specific test users | No | |
| `onboard_sofia.ts`, `create_thompson_partner.ts`, etc. | Onboards specific named test partners/users | No | Named fixtures for partner commission tests |
| `seed_supplements.ts` / `seed_supplements.sql` | Seeds supplement catalog | Caution | Check for duplicates |
| `seed_supplement_catalog_v2.sql` | V2 supplement catalog seed | Caution | |
| `populate_learn_section.py` | Populates AI knowledge/learn section | Caution | Requires Python |
| `grant_credit_manual.ts` | Manually grants store credit to a user | No | |

---

## Test Scripts

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| `test_*.ts` | Integration tests against live DB | Yes | Read-heavy; some write test rows |
| `test-scrape.mjs` / `test-scrape-v4.mjs` | WooCommerce scrape tests | Yes | |
| `test-woo-auth.ts` / `test-woo-products.ts` | WooCommerce API auth/product tests | Yes | |
| `cleanup-test.mjs` | Removes test data written by test scripts | Yes | Run after test sessions |

---

## One-off Fixes & Migrations

| Script | Purpose | Safe to Re-run? | Notes |
|--------|---------|-----------------|-------|
| `fix_*.ts` / `fix_*.sql` | Targeted RLS, permission, cascade, or data fixes | No | Applied once; check git history for context |
| `FIX_RLS.sql` / `fix_profiles_rls.sql` | RLS policy repair scripts | No | |
| `backfill_*.ts` / `backfill-profit.ts` | Backfills missing data columns | No | |
| `revert_*.ts` | Reverts orders or sales to previous state | Caution | |
| `provision-purechainaminos.mjs` / `verify-purechainaminos.mjs` | Tenant provisioning + verification for PureChainAminos | Once | |
| `delete-pca-tenant.mjs` | Permanently deletes PCA tenant | Destructive | Irreversible |
| `generate_peptide_articles.py` | AI-generates peptide content articles | Caution | Requires Python + OpenAI key |
| `ingest_*.ts` | Ingests data from external sources (Bochman, YouTube, Whisper) | Caution | |
| `refactor_imports.ts` | Bulk import path refactor helper | Once | |

---

## Conventions

- `.mjs` — Node ESM scripts; run with `node scripts/<name>.mjs`
- `.ts` — TypeScript; run with `npx tsx scripts/<name>.ts` (requires `tsx` in devDeps)
- `.sql` — Raw SQL; paste into Supabase SQL Editor or pipe via `psql`
- `.py` — Python scripts; run with `python scripts/<name>.py` (check Python availability)
- `.cmd` / `.ps1` — Windows-only wrappers for sentinel/service management
- `.cjs` — CommonJS fallback (rare; used for redirect verification)
