@echo off
rem 쇼핑 쇼츠 만들기 창을 연다(명령창 없이). 영상 파일을 이 파일 위에 끌어다 놓아도 된다.
cd /d "%~dp0"
if exist ".venv\Scripts\pythonw.exe" (
  start "" ".venv\Scripts\pythonw.exe" gui.py %*
) else (
  start "" pythonw gui.py %*
)
