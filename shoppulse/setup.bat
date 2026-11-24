@echo off
if not "%~1"=="--run" (
  start "SHOPPULSE setup" cmd /k ""%~f0" --run"
  exit /b
)
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ============================================
echo  SHOPPULSE 3.0 최초 설정
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [오류] Python 을 찾을 수 없습니다.
  echo        https://www.python.org/downloads/ 에서 Python 3.11 이상을 설치하세요.
  goto :fail
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo [확인] Python %%v

if not exist backend\.venv\Scripts\python.exe (
  echo [진행] Python 가상환경 생성 중...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo [오류] 가상환경 생성 실패
    goto :fail
  )
)
echo [진행] 백엔드 패키지 설치 중 - 처음 1~3분...
backend\.venv\Scripts\python -m pip install --upgrade pip -q
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt -q
if errorlevel 1 (
  echo [오류] 패키지 설치 실패. 인터넷 연결을 확인하세요.
  goto :fail
)
echo [확인] 백엔드 패키지 설치 완료

if not exist .env (
  copy .env.example .env >nul
  echo [안내] .env 파일을 만들었습니다. YouTube API 키 등은 .env 에 입력하세요. 없어도 실행됩니다.
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [안내] Node.js 가 없어 화면을 빌드하지 못했습니다.
  echo        https://nodejs.org/ 에서 LTS 버전을 설치한 뒤 setup.bat 을 다시 실행하세요.
  goto :fail
)
for /f "tokens=1" %%v in ('node --version 2^>^&1') do echo [확인] Node.js %%v
echo [진행] 화면 빌드 중 - 처음 1~3분...
pushd frontend
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [오류] npm install 실패. 인터넷 연결을 확인하세요.
  popd
  goto :fail
)
call npm run build
if errorlevel 1 (
  echo [오류] 화면 빌드 실패
  popd
  goto :fail
)
popd
echo [확인] 화면 빌드 완료

echo.
echo [진행] 상태 점검...
pushd backend
.venv\Scripts\python -m app.cli doctor
popd
echo.
echo ============================================
echo  설정 완료! 이제 start.bat 을 실행하세요.
echo  이 창은 닫아도 됩니다.
echo ============================================
goto :eof

:fail
echo.
echo ============================================
echo  설정이 중단되었습니다. 위의 [오류] 메시지를 확인하세요.
echo  이 창은 닫아도 됩니다.
echo ============================================
