@echo off
setlocal
cd /d "%~dp0"
cd ..
start "" "http://127.0.0.1:4173"
node scripts\serve.js
endlocal
