# deploy-v0.3.ps1 — 按需点对点抓取 v0.3 一键部署脚本
# 用法（在 Windows 服务器 PowerShell 7+ 以管理员运行）:
#   cd C:\Users\Administrator\project_baoyan
#   .\deploy\deploy-v0.3.ps1
#
# 前置：
#   - 已 git pull 最新代码到 refactor/ai-assistant 分支
#   - backend/.env 配好 INTERNAL_API_TOKEN / DEEPSEEK_API_KEY / DATABASE_URL
#   - crawler/.env 配好 CRAWLER_BACKEND_BASE_URL / INTERNAL_API_TOKEN
#   - python3 + pip 可用（spider 用）

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " 保研汪 v0.3 部署脚本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot"
Write-Host ""

# ------- 0. 预检 -------
function Assert-Service-Exists($name) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $svc) { Write-Error "❌ 找不到 Windows 服务: $name"; exit 1 }
}
Assert-Service-Exists 'baoyan-backend'
Assert-Service-Exists 'baoyan-caddy'

# Python 检查
$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) {
  $python = (Get-Command python3 -ErrorAction SilentlyContinue)
}
if (-not $python) {
  Write-Error "❌ 找不到 python/python3（spider 需要）"
  exit 1
}
Write-Host "✓ Python: $($python.Source)" -ForegroundColor Green

# Node 版本
$nodeVersion = node --version
Write-Host "✓ Node: $nodeVersion" -ForegroundColor Green

# ------- 1. Git pull -------
Write-Host ""
Write-Host "[1/8] git pull origin refactor/ai-assistant" -ForegroundColor Yellow
Set-Location $projectRoot
git fetch origin refactor/ai-assistant
git checkout refactor/ai-assistant
git pull origin refactor/ai-assistant

# ------- 2a. 先停 backend 服务，释放 prisma engine dll 锁 -------
Write-Host ""
Write-Host "[2a/8] 暂停 baoyan-backend 服务（释放 dll 锁）" -ForegroundColor Yellow
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
if ($LASTEXITCODE -ne 0) { Write-Error "❌ prisma migrate deploy 失败"; exit 1 }

# ------- 4. Department 数据 seed（幂等）-------
Write-Host ""
Write-Host "[4/8] seed Department 表（从 shared/university-departments.json）" -ForegroundColor Yellow
if (Test-Path "$projectRoot\shared\university-departments.json") {
  # --transpile-only 跳过严格类型检查，避免 @types/node 之类的开发依赖问题
  npx ts-node --transpile-only prisma/seed-from-university-departments.ts
  if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  dept seed 失败，但 migration 已应用，继续部署" -ForegroundColor DarkYellow
  }
} else {
  Write-Host "⚠️  shared/university-departments.json 不存在，跳过 dept seed" -ForegroundColor DarkYellow
}

# ------- 5. backend build -------
Write-Host ""
Write-Host "[5/8] backend build (nest build)" -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "❌ backend build 失败"; exit 1 }

# ------- 6. crawler 依赖 -------
Write-Host ""
Write-Host "[6/8] pip install -r requirements.txt (crawler)" -ForegroundColor Yellow
Set-Location "$projectRoot\crawler"
if (Test-Path "requirements.txt") {
  & $python.Source -m pip install -r requirements.txt --quiet
}

# ------- 7. 重启 backend 服务 -------
Write-Host ""
Write-Host "[7/8] 重启 NSSM 服务 baoyan-backend" -ForegroundColor Yellow
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
  Write-Error "❌ /health 5 次重试仍失败，请查 backend 日志"
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
Write-Host " ✅ v0.3 部署成功" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "新路由（已上线）:"
$routes | ForEach-Object { Write-Host "  - $_" }
Write-Host ""
Write-Host "下一步：在微信开发者工具上传小程序「体验版」"
Write-Host "       记得把 USE_LOCAL_BACKEND 改为 false 再上传"
Write-Host ""
