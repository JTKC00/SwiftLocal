@echo off
setlocal
cd /d "%~dp0"
cd ..

set "PYTHON_EXE=%SWIFTLOCAL_PYTHON%"
if not defined PYTHON_EXE if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
if not defined PYTHON_EXE if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Python\bin\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

"%PYTHON_EXE%" -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
endlocal
