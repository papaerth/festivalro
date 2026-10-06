@echo off
rem 노래방 자막 생성기 실행 (명령창 없이 프로그램 창만 띄움)
cd /d "%~dp0"
if exist ".venv\Scripts\pythonw.exe" (
  start "" ".venv\Scripts\pythonw.exe" main.py
) else (
  start "" pythonw main.py
)
