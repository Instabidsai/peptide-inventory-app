@echo off
cd /d "C:\Users\Not John Or Justin\Peptide Inv App"

echo ========================================================
echo   Downloading with HUMAN Credentials (Cookies)
echo ========================================================
echo.
echo   This script borrows your Chrome login to prove to YouTube 
echo   that you are not a bot. 
echo.

:: --cookies-from-browser chrome is the magic flag
python -m yt_dlp "https://youtu.be/0Wfbn9GjTqs" -f "bestaudio" --extract-audio --audio-format mp3 --cookies-from-browser chrome -o "scripts/audio_drop/%%(title)s.%%(ext)s"

echo.
echo ========================================================
if exist "scripts\audio_drop\*.mp3" (
    echo   SUCCESS! Audio downloaded.
    echo   Running ingestion...
    call npx tsx scripts/ingest_whisper.ts
) else (
    echo   Still blocked? 
    echo   Make sure Chrome is closed or try Edge if Chrome fails.
)
echo ========================================================
pause
