@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p OWNER=메일함 주인 이름 (예: 이진영): 
set /p SRC=PST 파일 또는 폴더 경로 (탐색기에서 끌어다 놓아도 됨): 
set SRC=%SRC:"=%
set /p SINCE=이 날짜 이후만 (YYYY-MM-DD, 엔터 = 최근 1년): 
if "%SINCE%"=="" (
  python -m mailbrain ingest "%SRC%" --owner "%OWNER%"
) else (
  python -m mailbrain ingest "%SRC%" --owner "%OWNER%" --since %SINCE%
)
pause
