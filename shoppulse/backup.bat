@echo off
if not "%~1"=="--run" (
  start "SHOPPULSE backup" cmd /k ""%~f0" --run"
  exit /b
)
chcp 65001 >nul
cd /d "%~dp0backend"
echo SHOPPULSE 데이터 백업 JSON 을 만듭니다...
.venv\Scripts\python -m app.cli backup
echo.
echo 백업 폴더: %~dp0backups
echo DB 파일 자체 복사본이 필요하면 서버 종료 후 %~dp0data\shoppulse.db 를 복사하세요.
