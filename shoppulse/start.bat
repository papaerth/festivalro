@echo off
if not "%~1"=="--run" (
  start "SHOPPULSE server" cmd /k ""%~f0" --run"
  exit /b
)
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist backend\.venv\Scripts\python.exe (
  echo [안내] 먼저 setup.bat 을 실행해 주세요.
  goto :eof
)
if not exist frontend\dist\index.html (
  echo [안내] 화면이 빌드되지 않았습니다. setup.bat 을 다시 실행해 주세요.
  goto :eof
)
rem Windows 앱 제어 정책이 서명 없는 .pyd 를 차단하면 SQLAlchemy 가 죽으므로 컴파일 확장을 제거한다(순수 Python 모듈로 대체됨)
if exist backend\scripts\strip_sqlalchemy_ext.py (
  backend\.venv\Scripts\python backend\scripts\strip_sqlalchemy_ext.py >nul 2>nul
) else (
  del /s /q "backend\.venv\Lib\site-packages\sqlalchemy\*_cy*.pyd" >nul 2>nul
)
set PORT=8787
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_PORT=" .env 2^>nul`) do if not "%%b"=="" set PORT=%%b

echo ============================================
echo  SHOPPULSE 3.0 실행 중 - http://localhost:%PORT%
echo  이 창을 닫으면 서버가 종료됩니다.
echo  자동 소싱은 이 창이 켜져 있어야 동작합니다.
echo ============================================
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
echo.
echo [안내] 서버가 종료되었습니다. 오류가 있었다면 위 메시지를 확인하세요.
echo        포트 %PORT% 가 이미 사용 중이면 .env 의 SHOPPULSE_PORT 를 바꾸세요.
