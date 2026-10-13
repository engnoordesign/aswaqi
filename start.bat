@echo off
rem Aswaqi - double-click to start. Keep this window open while you use Aswaqi.
title Aswaqi
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=24?0:1)"
if errorlevel 1 (
  echo Aswaqi needs Node.js 24 or newer. You have:
  node --version
  echo Download the latest version from https://nodejs.org
  pause
  exit /b 1
)
set PORT_TO_OPEN=3000
if defined PORT set PORT_TO_OPEN=%PORT%
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT_TO_OPEN%"
node --disable-warning=ExperimentalWarning --env-file-if-exists=.env server.js
pause
