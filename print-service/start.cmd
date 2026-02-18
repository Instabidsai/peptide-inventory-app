@echo off
title Label Print Service (D520)
cd /d "%~dp0"

:: Install deps if needed
if not exist node_modules (
    echo Installing dependencies...
    npm install
)

echo Starting label print service...
node server.js
pause
