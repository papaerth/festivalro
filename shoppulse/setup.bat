@echo off
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
  echo        https://www.python.org/downloads/ 에서 Python 3.11 이상을 설치하고
  echo        설치 화면에서 "Add python.exe to PATH" 를 반드시 체크하세요.
  pause & exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo [확인] Python %%v

if not exist backend\.venv (
  echo [진행] Python 가상환경 생성 중...
  python -m venv backend\.venv || (echo [오류] 가상환경 생성 실패 & pause & exit /b 1)
)
echo [진행] 백엔드 패키지 설치 중 (처음 1~3분)...
backend\.venv\Scripts\python -m pip install --upgrade pip -q
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt -q || (echo [오류] 패키지 설치 실패. 인터넷 연결을 확인하세요. & pause & exit /b 1)

if not exist .env (
  copy .env.example .env >nul
  echo [안내] .env 파일을 만들었습니다. YouTube API 키 등은 .env 에 입력하세요 (없어도 실행됩니다).
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [안내] Node.js(npm) 가 없어 화면(프런트엔드)을 빌드하지 못했습니다.
  echo        https://nodejs.org/ 에서 LTS 버전을 설치한 뒤 setup.bat 을 다시 실행하세요.
  echo        (백엔드 API 만으로는 대시보드 화면이 열리지 않습니다)
  pause & exit /b 1
)
echo [진행] 화면(프런트엔드) 빌드 중 (처음 1~3분)...
pushd frontend
call npm install --no-audit --no-fund || (echo [오류] npm install 실패 & popd & pause & exit /b 1)
call npm run build || (echo [오류] 화면 빌드 실패 & popd & pause & exit /b 1)
popd

echo.
echo [진행] 상태 점검...
pushd backend
.venv\Scripts\python -m app.cli doctor
popd
echo.
echo ============================================
echo  설정 완료! 이제 start.bat 을 실행하세요.
echo ============================================
pause
