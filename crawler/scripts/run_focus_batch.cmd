@echo off
setlocal

set "ROOT=C:\Users\Administrator\project_baoyan\crawler"
set "PROJECT_ROOT=C:\Users\Administrator\project_baoyan"
set "LOG_DIR=%ROOT%\logs"
set "PY=%ROOT%\.venv\Scripts\python.exe"
set "PRIORITY=%~1"
set "UNIVERSITIES=%~2"
set "RUN_NAME=%~3"

if "%PRIORITY%"=="" set "PRIORITY=P1"
if "%UNIVERSITIES%"=="" set "UNIVERSITIES=nankai,tju,hit,tongji,sysu"
if "%RUN_NAME%"=="" set "RUN_NAME=focus_batch"

cd /d "%ROOT%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

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

set "VERIFY_LOG=%LOG_DIR%\%RUN_NAME%_verify.log"
set "RUN_LOG=%LOG_DIR%\%RUN_NAME%.log"

echo [%date% %time%] verifying deploy>"%VERIFY_LOG%"
findstr /C:"focus5-drop-reasons-v2" "%ROOT%\baoyan_crawler\spiders\university_spider.py">nul || (
  echo spider build tag mismatch>>"%VERIFY_LOG%"
  exit /b 11
)
findstr /C:"article/492" /C:"c2583a577579" "%PROJECT_ROOT%\shared\crawl-overrides.json">nul || (
  echo crawl-overrides markers missing>>"%VERIFY_LOG%"
  exit /b 12
)
findstr /C:"detailAllowRules" /C:"graduate.sysu.edu.cn" "%PROJECT_ROOT%\shared\site-crawl-rules.json">nul || (
  echo site-crawl-rules markers missing>>"%VERIFY_LOG%"
  exit /b 13
)
echo [%date% %time%] verify passed>>"%VERIFY_LOG%"

echo [%date% %time%] start priority=%PRIORITY% universities=%UNIVERSITIES%>"%RUN_LOG%"
"%PY%" -u -m scrapy crawl university -a university_id=%UNIVERSITIES% -a priority=%PRIORITY% >> "%RUN_LOG%" 2>&1
echo [%date% %time%] exit=%ERRORLEVEL%>>"%RUN_LOG%"
exit /b %ERRORLEVEL%
