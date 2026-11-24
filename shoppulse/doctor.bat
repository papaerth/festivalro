@echo off
if not "%~1"=="--run" (
  start "SHOPPULSE doctor" cmd /k ""%~f0" --run"
  exit /b
)
chcp 65001 >nul
cd /d "%~dp0backend"
.venv\Scripts\python -m app.cli doctor
