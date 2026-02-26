@echo off
REM ═══════════════════════════════════════════════════════════
REM  AUTO-HEAL SENTINEL — Double-click to start
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
echo  ║   Watching for errors... Press Ctrl+C to stop ║
echo  ╚═══════════════════════════════════════════════╝
echo.

REM Run sentinel (add --auto-push to also commit+push fixes)
node scripts/auto-heal-sentinel.mjs

pause
