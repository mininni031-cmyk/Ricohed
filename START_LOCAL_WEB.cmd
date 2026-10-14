@echo off
cd /d "%~dp0"
echo Open http://localhost:8003 in your browser.
echo For online play, also run START_SERVER.cmd.
node server/dev.mjs
pause
