@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Electron is not installed yet.
  echo Run: "C:\Program Files\nodejs\npm.cmd" install
  pause
  exit /b 1
)
"C:\Program Files\nodejs\npm.cmd" run desktop
endlocal
