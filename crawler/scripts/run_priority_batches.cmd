@echo off
setlocal

set "ROOT=C:\Users\Administrator\project_baoyan\crawler"
set "PROJECT_ROOT=C:\Users\Administrator\project_baoyan"
set "LOG_DIR=%ROOT%\logs"
set "PY=%ROOT%\.venv\Scripts\python.exe"
set "START_FROM=%~1"

for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyyMMdd_HHmmss\")"') do set "STAMP=%%i"
if "%STAMP%"=="" set "STAMP=manual"
set "BATCH_LOG=%LOG_DIR%\crawler_batches_%STAMP%.log"
set "P0_LOG=%LOG_DIR%\crawler_p0_%STAMP%.log"
set "P1_LOG=%LOG_DIR%\crawler_p1_%STAMP%.log"
set "P2_LOG=%LOG_DIR%\crawler_p2_%STAMP%.log"

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

if /I "%START_FROM%"=="P1" goto runP1
if /I "%START_FROM%"=="P2" goto runP2

:runP0
echo [%date% %time%] start P0>>"%BATCH_LOG%"
"%PY%" -u -m scrapy crawl university -a priority=P0 > "%P0_LOG%" 2>&1
echo [%date% %time%] done P0 exit=%ERRORLEVEL%>>"%BATCH_LOG%"
dir /o-d "%LOG_DIR%\crawler_summary_P0_*.json">>"%BATCH_LOG%" 2>&1
if not "%ERRORLEVEL%"=="0" goto :end

:runP1
echo [%date% %time%] start P1>>"%BATCH_LOG%"
"%PY%" -u -m scrapy crawl university -a priority=P1 > "%P1_LOG%" 2>&1
echo [%date% %time%] done P1 exit=%ERRORLEVEL%>>"%BATCH_LOG%"
dir /o-d "%LOG_DIR%\crawler_summary_P1_*.json">>"%BATCH_LOG%" 2>&1
if not "%ERRORLEVEL%"=="0" goto :end

:runP2
echo [%date% %time%] start P2>>"%BATCH_LOG%"
"%PY%" -u -m scrapy crawl university -a priority=P2 > "%P2_LOG%" 2>&1
echo [%date% %time%] done P2 exit=%ERRORLEVEL%>>"%BATCH_LOG%"
dir /o-d "%LOG_DIR%\crawler_summary_P2_*.json">>"%BATCH_LOG%" 2>&1

:end
echo [%date% %time%] batch finished>>"%BATCH_LOG%"
echo batch_log=%BATCH_LOG%
echo p0_log=%P0_LOG%
echo p1_log=%P1_LOG%
echo p2_log=%P2_LOG%
endlocal
