@echo off
rem 사용: start.bat        → 서버 창을 열고 브라우저 실행
rem       start.bat --min  → 서버 창을 최소화해서 실행(바탕화면 바로가기용)
rem 이미 서버가 켜져 있으면 브라우저만 연다.
if "%~1"=="--run" goto :run
if "%~1"=="--open" goto :open
setlocal
cd /d "%~dp0"
set PORT=8787
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_PORT=" .env 2^>nul`) do if not "%%b"=="" set PORT=%%b
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  call "%~f0" --open %PORT%
  exit /b
)
if "%~1"=="--min" (
  start "SHOPPULSE server" /min cmd /k ""%~f0" --run"
) else (
  start "SHOPPULSE server" cmd /k ""%~f0" --run"
)
exit /b

:run
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
start "" /b cmd /c "timeout /t 4 >nul & call "%~f0" --open %PORT%"
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
echo.
echo [안내] 서버가 종료되었습니다. 오류가 있었다면 위 메시지를 확인하세요.
echo        포트 %PORT% 가 이미 사용 중이면 .env 의 SHOPPULSE_PORT 를 바꾸세요.

goto :eof

:open
rem 사용: start.bat --open 포트  → .env 의 SHOPPULSE_BROWSER(chrome/edge/default) 에 따라 화면을 연다. 크롬이 기본.
setlocal
cd /d "%~dp0"
set URL=http://localhost:%~2
set BROWSER=chrome
set APPMODE=0
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_BROWSER=" .env 2^>nul`) do if not "%%b"=="" set BROWSER=%%b
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_CHROME_APP=" .env 2^>nul`) do if not "%%b"=="" set APPMODE=%%b
set CHROME=
rem 주의: 괄호 블록 안에서 %ProgramFiles(x86)% 를 쓰면 cmd 가 깨지므로 미리 변수로 받아 둔다
set "PF86=%ProgramFiles(x86)%"
set "C1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "C2=%PF86%\Google\Chrome\Application\chrome.exe"
set "C3=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "E1=%PF86%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if /i "%BROWSER%"=="chrome" (
  if exist "%C1%" set "CHROME=%C1%"
  if exist "%C2%" set "CHROME=%C2%"
  if exist "%C3%" set "CHROME=%C3%"
)
if /i "%BROWSER%"=="edge" (
  if exist "%E1%" set "CHROME=%E1%"
  if exist "%E2%" set "CHROME=%E2%"
)
if defined CHROME (
  if "%APPMODE%"=="1" (
    start "" "%CHROME%" --app=%URL%
  ) else (
    start "" "%CHROME%" %URL%
  )
) else (
  rem 크롬/엣지를 못 찾으면 윈도우 기본 브라우저
  start "" %URL%
)
exit /b
