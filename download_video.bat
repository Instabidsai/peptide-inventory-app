@echo off
echo Attempting to download video...
python -m yt_dlp "https://youtu.be/0Wfbn9GjTqs" -f "bestaudio" --extract-audio --audio-format mp3 -o "scripts/audio_drop/%%(title)s.%%(ext)s"
echo.
echo If successful, you will see the file in scripts/audio_drop
pause
