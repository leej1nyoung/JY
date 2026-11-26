@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p NAME=내 이름 (파일 이름에 씀): 
echo Outlook에 연결된 내 메일함에서 최근 1년 메일을 내보냅니다. Outlook을 켜 둔 상태로 기다려 주세요.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export_outlook.ps1" -Out "%USERPROFILE%\Desktop\%NAME%_메일.jsonl" -AllStores
echo.
echo 바탕화면의 %NAME%_메일.jsonl 파일을 브레인 화면 [메일 넣기]에 올려 주세요.
pause
