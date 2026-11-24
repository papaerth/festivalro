@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
if "%~1"=="" (
  echo 사용법: 백업 JSON 파일을 이 restore.bat 아이콘 위로 끌어다 놓으세요.
  echo        또는: restore.bat "backups\shoppulse-backup-....json"
  pause & exit /b 1
)
echo [주의] 현재 데이터를 모두 지우고 "%~1" 내용으로 복원합니다. (사전 백업이 자동 생성됩니다)
set /p OK=계속하려면 Y 를 입력하세요: 
if /i not "%OK%"=="Y" exit /b 0
.venv\Scripts\python -m app.cli restore "%~1" replace
pause
