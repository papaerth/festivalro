@echo off
rem SHOPPULSE 업데이트: GitHub 최신 코드를 받아 덮어쓴다. data, .env, backups, 가상환경, node_modules 는 유지.
if not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\shoppulse-update-runner.bat" >nul
  start "SHOPPULSE update" cmd /k ""%TEMP%\shoppulse-update-runner.bat" --run "%~dp0.""
  exit /b
)
chcp 65001 >nul
setlocal
set ROOT=%~2
cd /d "%ROOT%"
echo ============================================
echo  SHOPPULSE 3.0 업데이트
echo  폴더: %CD%
echo ============================================
echo.

set BRANCH=claude/practical-darwin-xswmhh
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_UPDATE_BRANCH=" .env 2^>nul`) do if not "%%b"=="" set BRANCH=%%b
set ZIPURL=https://github.com/papaerth/festivalro/archive/refs/heads/%BRANCH%.zip
set WORK=%TEMP%\shoppulse-update

netstat -ano | findstr /r /c:":8787 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [오류] SHOPPULSE 서버가 실행 중입니다. start.bat 창을 먼저 닫고 다시 실행하세요.
  goto :end
)

if exist backend\.venv\Scripts\python.exe (
  echo [진행] 업데이트 전 백업...
  pushd backend
  .venv\Scripts\python -m app.cli backup
  popd
)

echo [진행] 최신 코드 내려받는 중 - %BRANCH%
rd /s /q "%WORK%" >nul 2>nul
mkdir "%WORK%"
curl.exe -L -s -S -o "%WORK%\src.zip" "%ZIPURL%"
if errorlevel 1 (
  echo [오류] 내려받기 실패. 인터넷 연결 또는 GitHub 접근을 확인하세요.
  goto :end
)
echo [진행] 압축 해제...
tar.exe -xf "%WORK%\src.zip" -C "%WORK%"
if errorlevel 1 (
  echo [오류] 압축 해제 실패
  goto :end
)
set SRC=
for /d %%d in ("%WORK%\festivalro-*") do set SRC=%%d\shoppulse
if "%SRC%"=="" (
  echo [오류] 압축 안에서 shoppulse 폴더를 찾지 못했습니다.
  goto :end
)
if not exist "%SRC%\setup.bat" (
  echo [오류] 압축 안에 setup.bat 이 없습니다: %SRC%
  goto :end
)

echo [진행] 파일 교체 - data, .env, backups, 가상환경, node_modules 는 유지...
robocopy "%SRC%" "%ROOT%" /E /XD data backups .venv node_modules dist __pycache__ .pytest_cache /XF .env /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo [오류] 파일 복사 실패
  goto :end
)
rd /s /q "%WORK%" >nul 2>nul
echo [확인] 코드 교체 완료

echo.
echo [진행] 설정 갱신 - 패키지 설치, 화면 빌드...
call "%ROOT%\setup.bat" --run
echo.
echo ============================================
echo  업데이트 끝. 위에 "설정 완료" 가 보이면 start.bat 을 실행하세요.
echo ============================================
goto :eof

:end
echo.
echo ============================================
echo  업데이트가 중단되었습니다. 기존 파일은 바뀌지 않았습니다.
echo ============================================
