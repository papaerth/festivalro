@echo off
chcp 65001 >nul
cd /d %~dp0
if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat
rem input 폴더에 넣어 둔, 아직 안 만든 편을 모두 만든다
python shorts.py auto --all
pause
