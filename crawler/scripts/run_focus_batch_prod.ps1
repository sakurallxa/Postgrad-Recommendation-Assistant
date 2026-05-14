param(
  [string]$Priority = "P2",
  [string]$Universities = "bjtu,ustb,cufe,bfsu,uibe,bupt,cuc,ncepu",
  [string]$RunName = "focus_batch_ps",
  [int]$TimeoutSeconds = 240,
  [int]$BackendTimeoutSeconds = 30,
  [string]$Stamp = "manual"
)

$ErrorActionPreference = "Stop"

$Root = "C:\Users\Administrator\project_baoyan\crawler"
$ProjectRoot = "C:\Users\Administrator\project_baoyan"
$LogDir = Join-Path $Root "logs"
$Py = Join-Path $Root ".venv\Scripts\python.exe"

if (-not (Test-Path $Root)) { throw "crawler root missing: $Root" }
if (-not (Test-Path $Py)) { throw "python runtime missing: $Py" }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$Priority = ($Priority -replace '"','').Trim()
$Universities = ($Universities -replace '"','').Trim()
$RunName = ($RunName -replace '"','').Trim()
$Stamp = ($Stamp -replace '"','').Trim()

if ([string]::IsNullOrWhiteSpace($Stamp)) {
  $Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"
$env:CRAWLER_BACKEND_TIMEOUT_SECONDS = "$BackendTimeoutSeconds"
$env:CLOSESPIDER_TIMEOUT = "$TimeoutSeconds"

if ([string]::IsNullOrWhiteSpace($env:CRAWLER_INGEST_KEY)) {
  $BackendEnv = Join-Path $ProjectRoot "backend\.env"
  if (Test-Path $BackendEnv) {
    $line = Get-Content $BackendEnv | Where-Object { $_ -match '^CRAWLER_INGEST_KEY=' } | Select-Object -Last 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $env:CRAWLER_INGEST_KEY = ($line -replace '^CRAWLER_INGEST_KEY=', '').Trim().Trim('"')
    }
  }
}

if ([string]::IsNullOrWhiteSpace($env:CRAWLER_INGEST_KEY)) {
  throw "CRAWLER_INGEST_KEY is required. Configure it in the environment or backend\.env before running."
}

$RunLog = Join-Path $LogDir "$RunName`_$Stamp.log"
$SummaryFile = Join-Path $LogDir "$RunName`_$Stamp`_summary.txt"

Write-Output "root=$Root"
Write-Output "python=$Py"
Write-Output "run_log=$RunLog"
Write-Output "summary_file=$SummaryFile"

Push-Location $Root
try {
  & $Py -m py_compile "baoyan_crawler\spiders\university_spider.py"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] start priority=$Priority universities=$Universities timeout=$TimeoutSeconds" | Set-Content -Encoding UTF8 $RunLog
  $stdoutFile = Join-Path $LogDir "$RunName`_$Stamp.stdout.log"
  $stderrFile = Join-Path $LogDir "$RunName`_$Stamp.stderr.log"
  if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -Force }
  if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force }

  $args = @(
    "-u",
    "-m", "scrapy",
    "crawl", "university",
    "-s", "CLOSESPIDER_TIMEOUT=$TimeoutSeconds",
    "-s", "DOWNLOAD_DELAY=5",
    "-s", "RANDOMIZE_DOWNLOAD_DELAY=False",
    "-s", "AUTOTHROTTLE_ENABLED=False",
    "-a", "university_id=$Universities",
    "-a", "priority=$Priority"
  )

  $proc = Start-Process -FilePath $Py `
    -ArgumentList $args `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -NoNewWindow `
    -PassThru `
    -Wait
  $runExit = $proc.ExitCode

  if (Test-Path $stdoutFile) {
    Get-Content $stdoutFile | Add-Content -Encoding UTF8 $RunLog
  }
  if (Test-Path $stderrFile) {
    Get-Content $stderrFile | Add-Content -Encoding UTF8 $RunLog
  }
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] exit=$runExit" | Add-Content -Encoding UTF8 $RunLog

  Get-ChildItem "$LogDir\crawler_summary_$Priority*.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object Name, LastWriteTime, Length |
    Out-String | Set-Content -Encoding UTF8 $SummaryFile

  Write-Output "exit=$runExit"
  exit $runExit
}
catch {
  $message = $_.Exception.Message
  try {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] error=$message" | Add-Content -Encoding UTF8 $RunLog
  } catch {}
  Write-Error $message
  exit 99
}
finally {
  Pop-Location
}
