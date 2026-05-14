@echo off
setlocal EnableExtensions

set "ROOT=C:\Users\Administrator\project_baoyan\crawler"
set "PROJECT_ROOT=C:\Users\Administrator\project_baoyan"
set "LOG_DIR=%ROOT%\logs"
set "PY=%ROOT%\.venv\Scripts\python.exe"

set "PRIORITY=%~1"
set "UNIVERSITIES=%~2"
set "RUN_NAME=%~3"
set "TIMEOUT_SECONDS=%~4"
set "BACKEND_TIMEOUT_SECONDS=%~5"
set "STAMP=%~6"

if "%PRIORITY%"=="" set "PRIORITY=P2"
if "%UNIVERSITIES%"=="" set "UNIVERSITIES=bjtu,ustb,cufe,bfsu,uibe,bupt,cuc,ncepu"
if "%RUN_NAME%"=="" set "RUN_NAME=focus_batch_prod"
if "%TIMEOUT_SECONDS%"=="" set "TIMEOUT_SECONDS=480"
if "%BACKEND_TIMEOUT_SECONDS%"=="" set "BACKEND_TIMEOUT_SECONDS=30"

if not exist "%ROOT%" (
  echo crawler root missing: %ROOT%
  exit /b 2
)

cd /d "%ROOT%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if not exist "%PY%" (
  echo python runtime missing: %PY%
  exit /b 3
)

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

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"
set "CRAWLER_BACKEND_TIMEOUT_SECONDS=%BACKEND_TIMEOUT_SECONDS%"
set "CLOSESPIDER_TIMEOUT=%TIMEOUT_SECONDS%"

if "%STAMP%"=="" for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyyMMdd_HHmmss\")"') do set "STAMP=%%i"
if "%STAMP%"=="" set "STAMP=manual"

set "RUN_LOG=%LOG_DIR%\%RUN_NAME%_%STAMP%.log"
set "VERIFY_LOG=%LOG_DIR%\%RUN_NAME%_%STAMP%_verify.log"
set "SUMMARY_SNAPSHOT=%LOG_DIR%\%RUN_NAME%_%STAMP%_summary.txt"

echo [%date% %time%] verify start>"%VERIFY_LOG%"
echo root=%ROOT%>>"%VERIFY_LOG%"
echo project_root=%PROJECT_ROOT%>>"%VERIFY_LOG%"
echo python=%PY%>>"%VERIFY_LOG%"
echo priority=%PRIORITY%>>"%VERIFY_LOG%"
echo universities=%UNIVERSITIES%>>"%VERIFY_LOG%"
echo timeout=%TIMEOUT_SECONDS% backend_timeout=%BACKEND_TIMEOUT_SECONDS%>>"%VERIFY_LOG%"

findstr /C:"focus5-drop-reasons-v2" "%ROOT%\baoyan_crawler\spiders\university_spider.py" >nul || (
  echo spider build tag mismatch>>"%VERIFY_LOG%"
  exit /b 11
)

if not exist "%PROJECT_ROOT%\shared\crawl-overrides.json" (
  echo crawl-overrides missing>>"%VERIFY_LOG%"
  exit /b 12
)

if not exist "%PROJECT_ROOT%\shared\site-crawl-rules.json" (
  echo site-crawl-rules missing>>"%VERIFY_LOG%"
  exit /b 13
)

"%PY%" -m py_compile baoyan_crawler\spiders\university_spider.py >>"%VERIFY_LOG%" 2>&1 || (
  echo spider compile failed>>"%VERIFY_LOG%"
  exit /b 14
)

echo [%date% %time%] verify passed>>"%VERIFY_LOG%"

echo [%date% %time%] start priority=%PRIORITY% universities=%UNIVERSITIES% timeout=%TIMEOUT_SECONDS%>"%RUN_LOG%"
"%PY%" -u -m scrapy crawl university -s CLOSESPIDER_TIMEOUT=%TIMEOUT_SECONDS% -s DOWNLOAD_DELAY=5 -s RANDOMIZE_DOWNLOAD_DELAY=False -s AUTOTHROTTLE_ENABLED=False -a university_id=%UNIVERSITIES% -a priority=%PRIORITY% >> "%RUN_LOG%" 2>&1
set "RUN_EXIT=%ERRORLEVEL%"
echo [%date% %time%] exit=%RUN_EXIT%>>"%RUN_LOG%"

(
  echo [%date% %time%] latest summary snapshot
  dir /o-d "%LOG_DIR%\crawler_summary_%PRIORITY%_*.json"
) > "%SUMMARY_SNAPSHOT%" 2>&1

echo run_log=%RUN_LOG%
echo verify_log=%VERIFY_LOG%
echo summary_snapshot=%SUMMARY_SNAPSHOT%
exit /b %RUN_EXIT%
