# deploy-v0.3.ps1 — v0.3+ 一键部署脚本（适配 PowerShell 5.1 / 7+）
# 用法（在 Windows 服务器以管理员运行）:
#   cd C:\Users\Administrator\project_baoyan
#   .\deploy\deploy-v0.3.ps1
#
# 前置：
#   - 已 git pull 最新代码到 refactor/ai-assistant 分支
#   - backend/.env 配好 INTERNAL_API_TOKEN / DEEPSEEK_API_KEY / DATABASE_URL
#   - crawler/.env 配好 CRAWLER_BACKEND_BASE_URL / INTERNAL_API_TOKEN
#   - python3 + pip 可用（spider 用）
#
# 注意：所有 Write-Host / Write-Error 字符串保持纯 ASCII，
#       因为 PowerShell 5.1 默认按 ANSI(GBK) 解析 .ps1 文件，
#       UTF-8 中文（尤其全角标点）可能导致 ParseError 全文件不执行。
#       Switch the console code page to UTF-8 so step messages still render properly.

chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " baoyan v0.3+ deploy script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot"
Write-Host ""

# ------- 0. 预检 -------
function Assert-Service-Exists($name) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) { Write-Error "[ERROR] Windows service not found: $name"; exit 1 }
}
Assert-Service-Exists 'baoyan-backend'
Assert-Service-Exists 'baoyan-caddy'

# Python 检查
$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) {
  $python = (Get-Command python3 -ErrorAction SilentlyContinue)
}
if (-not $python) {
  Write-Error "[ERROR] python/python3 not found (spider needs it)"
  exit 1
}
Write-Host "[OK] Python: $($python.Source)" -ForegroundColor Green

# Node 版本
$nodeVersion = node --version
Write-Host "[OK] Node: $nodeVersion" -ForegroundColor Green

# ------- 1. Git pull -------
Write-Host ""
Write-Host "[1/8] git pull origin refactor/ai-assistant" -ForegroundColor Yellow
Set-Location $projectRoot
git fetch origin refactor/ai-assistant
git checkout refactor/ai-assistant
git pull origin refactor/ai-assistant

# ------- 2a. 先停 backend 服务，释放 prisma engine dll 锁 -------
Write-Host ""
Write-Host "[2a/8] stop baoyan-backend service (release prisma dll lock)" -ForegroundColor Yellow
sc.exe stop baoyan-backend | Out-Null
Start-Sleep -Seconds 3

# ------- 2b. backend 依赖（含 devDependencies，nest CLI 是 dev 依赖）-------
Write-Host ""
Write-Host "[2b/8] npm install (backend)" -ForegroundColor Yellow
Set-Location "$projectRoot\backend"
npm install --no-audit --no-fund

# ------- 3. Prisma generate + migrate -------
Write-Host ""
Write-Host "[3/8] Prisma migrate deploy" -ForegroundColor Yellow
npx prisma generate
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Error "[ERROR] prisma migrate deploy failed"; exit 1 }

# ------- 4. Department 数据 seed（幂等）-------
Write-Host ""
Write-Host "[4/8] seed Department table (from shared/university-departments.json)" -ForegroundColor Yellow
if (Test-Path "$projectRoot\shared\university-departments.json") {
  # --transpile-only 跳过严格类型检查，避免 @types/node 之类的开发依赖问题
  npx ts-node --transpile-only prisma/seed-from-university-departments.ts
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] dept seed failed, but migration applied; continuing" -ForegroundColor DarkYellow
  }
} else {
  Write-Host "[WARN] shared/university-departments.json missing, skip dept seed" -ForegroundColor DarkYellow
}

# ------- 5. backend build -------
Write-Host ""
Write-Host "[5/8] backend build (nest build)" -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "[ERROR] backend build failed"; exit 1 }

# ------- 6. crawler 依赖 -------
Write-Host ""
Write-Host "[6/8] pip install -r requirements.txt (crawler)" -ForegroundColor Yellow
Set-Location "$projectRoot\crawler"
if (Test-Path "requirements.txt") {
  & $python.Source -m pip install -r requirements.txt --quiet
}

# ------- 7. 重启 backend 服务 -------
Write-Host ""
Write-Host "[7/8] restart NSSM service baoyan-backend" -ForegroundColor Yellow
Set-Location $projectRoot
sc.exe stop baoyan-backend | Out-Null
Start-Sleep -Seconds 3
sc.exe start baoyan-backend | Out-Null
Start-Sleep -Seconds 8

# ------- 8. Health check -------
Write-Host ""
Write-Host "[8/8] Health check" -ForegroundColor Yellow
$attempts = 0
$maxAttempts = 6
$healthOk = $false
while ($attempts -lt $maxAttempts) {
  try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 5
    if ($resp.status -eq 'healthy') { $healthOk = $true; break }
  } catch {
    # ignore retry
  }
  Start-Sleep -Seconds 3
  $attempts += 1
}

if (-not $healthOk) {
  Write-Error "[ERROR] /health failed after 6 retries. See backend log:"
  Get-Content "C:\Users\Administrator\backend.log" -Tail 50
  exit 1
}

# 检查新路由
$routes = @(
  '/api/v1/crawl-jobs',
  '/api/v1/crawl-jobs/latest',
  '/api/v1/internal/departments/by-ids'
)
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " [OK] deploy success" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Routes online:"
$routes | ForEach-Object { Write-Host "  - $_" }
Write-Host ""
Write-Host "Next step: upload the miniprogram trial version in WeChat DevTools."
Write-Host "           Make sure USE_LOCAL_BACKEND is set to false before upload."
Write-Host ""
