@echo off
rem 바탕화면에 'SHOPPULSE 3.0' 바로가기를 만든다. 더블클릭 = 서버 최소화 실행 + 브라우저 열기.
chcp 65001 >nul
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\SHOPPULSE 3.0.lnk'); $s.TargetPath='%ROOT%\start.bat'; $s.Arguments='--min'; $s.WorkingDirectory='%ROOT%'; $s.IconLocation='%ROOT%\shoppulse.ico,0'; $s.Description='SHOPPULSE 3.0 실행'; $s.Save(); Write-Output ('[확인] 바로가기 생성: '+$d+'\SHOPPULSE 3.0.lnk')"
if errorlevel 1 echo [오류] 바로가기 생성 실패
if "%~1"=="" pause
