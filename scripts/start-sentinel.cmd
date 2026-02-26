@echo off
REM ═══════════════════════════════════════════════════════════
REM  AUTO-HEAL SENTINEL — Runs forever, auto-restarts on crash
REM  Watches for errors 24/7 and auto-fixes them
REM ═══════════════════════════════════════════════════════════

title Peptide Auto-Heal Sentinel

cd /d "C:\Users\Not John Or Justin\Peptide Inv App"

REM Clear Claude Code session vars so it can spawn fresh
set CLAUDECODE=
set CLAUDE_CODE_ENTRYPOINT=

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   AUTO-HEAL SENTINEL                         ║
echo  ║   Always-on error watcher + auto-fixer       ║
echo  ║   Auto-restarts on crash. Ctrl+C to stop.    ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:loop
echo [%date% %time%] Starting sentinel...
node scripts/auto-heal-sentinel.mjs
echo.
echo [%date% %time%] Sentinel exited. Restarting in 30 seconds...
echo   (Press Ctrl+C now to stop permanently)
timeout /t 30 /nobreak >nul
goto loop
