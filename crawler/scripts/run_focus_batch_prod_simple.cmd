@echo off
setlocal

set "ROOT=C:\Users\Administrator\project_baoyan\crawler"
set "LOG_DIR=%ROOT%\logs"
set "PY=%ROOT%\.venv\Scripts\python.exe"

set "PRIORITY=%~1"
set "UNIVERSITIES=%~2"
set "RUN_NAME=%~3"
set "TIMEOUT_SECONDS=%~4"
set "BACKEND_TIMEOUT_SECONDS=%~5"
set "STAMP=%~6"

if not defined PRIORITY if defined FOCUS_PRIORITY set "PRIORITY=%FOCUS_PRIORITY%"
if not defined UNIVERSITIES if defined FOCUS_UNIVERSITIES set "UNIVERSITIES=%FOCUS_UNIVERSITIES%"
if not defined RUN_NAME if defined FOCUS_RUN_NAME set "RUN_NAME=%FOCUS_RUN_NAME%"
if not defined TIMEOUT_SECONDS if defined FOCUS_TIMEOUT_SECONDS set "TIMEOUT_SECONDS=%FOCUS_TIMEOUT_SECONDS%"
if not defined BACKEND_TIMEOUT_SECONDS if defined FOCUS_BACKEND_TIMEOUT_SECONDS set "BACKEND_TIMEOUT_SECONDS=%FOCUS_BACKEND_TIMEOUT_SECONDS%"
if not defined STAMP if defined FOCUS_STAMP set "STAMP=%FOCUS_STAMP%"

if "%PRIORITY%"=="" set "PRIORITY=P2"
if "%UNIVERSITIES%"=="" set "UNIVERSITIES=bjtu,ustb,cufe,bfsu,uibe,bupt,cuc,ncepu"
if "%RUN_NAME%"=="" set "RUN_NAME=focus_batch_simple"
if "%TIMEOUT_SECONDS%"=="" set "TIMEOUT_SECONDS=240"
if "%BACKEND_TIMEOUT_SECONDS%"=="" set "BACKEND_TIMEOUT_SECONDS=30"
if "%STAMP%"=="" set "STAMP=manual"

set "PRIORITY=%PRIORITY:"=%"
set "UNIVERSITIES=%UNIVERSITIES:"=%"
set "RUN_NAME=%RUN_NAME:"=%"
set "TIMEOUT_SECONDS=%TIMEOUT_SECONDS:"=%"
set "BACKEND_TIMEOUT_SECONDS=%BACKEND_TIMEOUT_SECONDS:"=%"
set "STAMP=%STAMP:"=%"

set "PRIORITY=%PRIORITY: =%"
set "UNIVERSITIES=%UNIVERSITIES: =%"
set "RUN_NAME=%RUN_NAME: =%"
set "TIMEOUT_SECONDS=%TIMEOUT_SECONDS: =%"
set "BACKEND_TIMEOUT_SECONDS=%BACKEND_TIMEOUT_SECONDS: =%"
set "STAMP=%STAMP: =%"

cd /d "%ROOT%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"
set "CRAWLER_BACKEND_TIMEOUT_SECONDS=%BACKEND_TIMEOUT_SECONDS%"
set "CLOSESPIDER_TIMEOUT=%TIMEOUT_SECONDS%"

if "%CRAWLER_INGEST_KEY%"=="" if exist "%PROJECT_ROOT%\backend\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_ROOT%\backend\.env") do (
    if /I "%%A"=="CRAWLER_INGEST_KEY" set "CRAWLER_INGEST_KEY=%%~B"
  )
  set "CRAWLER_INGEST_KEY=%CRAWLER_INGEST_KEY:"=%"
)

if "%CRAWLER_INGEST_KEY%"=="" (
  echo CRAWLER_INGEST_KEY is required. Configure it in the environment before running.
  exit /b 4
)

set "RUN_LOG=%LOG_DIR%\%RUN_NAME%_%STAMP%.log"
set "SUMMARY_FILE=%LOG_DIR%\%RUN_NAME%_%STAMP%_summary.txt"

echo root=%ROOT%
echo python=%PY%
echo run_log=%RUN_LOG%
echo summary_file=%SUMMARY_FILE%

"%PY%" -m py_compile baoyan_crawler\spiders\university_spider.py || exit /b 14

echo [%date% %time%] start priority=%PRIORITY% universities=%UNIVERSITIES% timeout=%TIMEOUT_SECONDS%>"%RUN_LOG%"
"%PY%" -u -m scrapy crawl university -s CLOSESPIDER_TIMEOUT=%TIMEOUT_SECONDS% -s DOWNLOAD_DELAY=5 -s RANDOMIZE_DOWNLOAD_DELAY=False -s AUTOTHROTTLE_ENABLED=False -a university_id=%UNIVERSITIES% -a priority=%PRIORITY% >> "%RUN_LOG%" 2>&1
set "RUN_EXIT=%ERRORLEVEL%"
echo [%date% %time%] exit=%RUN_EXIT%>>"%RUN_LOG%"

dir /o-d "%LOG_DIR%\crawler_summary_%PRIORITY%_*.json" > "%SUMMARY_FILE%" 2>&1
echo exit=%RUN_EXIT%
exit /b %RUN_EXIT%
