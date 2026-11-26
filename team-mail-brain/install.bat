@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/2] Python 확인
python --version || (echo Python이 없습니다. 사내 소프트웨어 센터에서 Python 3.10 이상을 설치해 주세요. & pause & exit /b 1)
echo [2/2] PST 읽기 라이브러리 설치 (인터넷 없이 wheels 폴더에서 설치)
python -m pip install --no-index --find-links wheels -r requirements.txt || python -m pip install -r requirements.txt
echo.
echo 설치 끝. start_server.bat 을 실행하세요.
pause
