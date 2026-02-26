@echo off
REM Silent sentinel launcher for Windows Task Scheduler
REM Auto-restarts on crash with 30s delay
cd /d "C:\Users\Not John Or Justin\Peptide Inv App"
set CLAUDECODE=
set CLAUDE_CODE_ENTRYPOINT=
:loop
node scripts/auto-heal-sentinel.mjs >> scripts/reports/sentinel-service.log 2>&1
timeout /t 30 /nobreak >nul
goto loop
