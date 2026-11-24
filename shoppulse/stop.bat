@echo off
rem 실행 중인 SHOPPULSE 서버(포트 8787 또는 .env 의 SHOPPULSE_PORT)를 종료한다.
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8787
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "SHOPPULSE_PORT=" .env 2^>nul`) do if not "%%b"=="" set PORT=%%b
set FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  set FOUND=1
  taskkill /pid %%p /f >nul 2>nul
)
if defined FOUND (echo [확인] SHOPPULSE 서버를 종료했습니다.) else (echo [안내] 실행 중인 SHOPPULSE 서버가 없습니다.)
timeout /t 3 >nul
