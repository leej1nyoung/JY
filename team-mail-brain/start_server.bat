@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p PW=팀원 접속 암호를 정하세요 (팀원에게만 공유): 
echo.
echo 이 PC의 사내 IP:
ipconfig | findstr /i "IPv4"
echo 팀원은 브라우저에서 http://위IP:8765 로 접속합니다.
echo.
python -m mailbrain serve --host 0.0.0.0 --port 8765 --password "%PW%"
pause
