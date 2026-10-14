@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 first, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\ws (
  call npm install --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo RICOCHET server: ws://localhost:3001/ws
call npm start
pause
