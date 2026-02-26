@echo off
REM Auto-Heal Scheduled Task
REM Run this via Windows Task Scheduler every 1-2 hours
REM
REM Setup:
REM   1. Open Task Scheduler (taskschd.msc)
REM   2. Create Basic Task → Name: "Peptide Auto-Heal"
REM   3. Trigger: Daily, repeat every 1 hour
REM   4. Action: Start a Program
REM      Program: cmd.exe
REM      Arguments: /c "C:\Users\Not John Or Justin\Peptide Inv App\scripts\auto-heal-scheduled.cmd"
REM   5. Check "Run whether user is logged on or not"

cd /d "C:\Users\Not John Or Justin\Peptide Inv App"

REM Clear Claude Code session vars so it can spawn fresh
set CLAUDECODE=
set CLAUDE_CODE_ENTRYPOINT=

REM Log start time
echo [%date% %time%] Auto-heal starting >> scripts\reports\scheduled-runs.log

REM Run detect-only first (fast, no CC spawn)
node scripts/auto-heal.mjs --detect-only >> scripts\reports\scheduled-runs.log 2>&1

REM Check exit code — 0 means no issues, non-zero means issues found
if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] No issues found — skipping full heal >> scripts\reports\scheduled-runs.log
) else (
    echo [%date% %time%] Issues found — running full auto-heal >> scripts\reports\scheduled-runs.log
    node scripts/auto-heal.mjs >> scripts\reports\scheduled-runs.log 2>&1
    echo [%date% %time%] Auto-heal complete >> scripts\reports\scheduled-runs.log
)
