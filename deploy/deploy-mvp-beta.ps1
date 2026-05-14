#Requires -RunAsAdministrator
<#
.SYNOPSIS
  MVP β-场景一键部署脚本（Windows Server 2022）

.DESCRIPTION
  在生产服务器 C:\Users\Administrator\project_baoyan 上：
    1. 拉取最新代码
    2. 安装依赖、运行 Prisma 迁移、构建
    3. 写入新增的 .env 变量（CRAWLER_ADMIN_KEY 等）
    4. 重启 baoyan-backend NSSM 服务
    5. 健康检查
    6. 触发一次 P0 重抓验证

.USAGE
  RDP 登录服务器，打开管理员 PowerShell，运行：
    cd C:\Users\Administrator\project_baoyan\deploy
    .\deploy-mvp-beta.ps1

.NOTES
  - 如果迁移失败会立即 abort，不会重启服务（保护现网）
  - 备份会写到 C:\Users\Administrator\backups\<timestamp>\
  - 重启后会做 5 次健康检查，全失败才报警
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\Administrator\project_baoyan"
$BackupDir = "C:\Users\Administrator\backups\$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MVP β 部署脚本启动" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Step 1: 备份当前 .env 和 DB
Write-Host "`n[1/7] 备份当前生产配置和数据库..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
if (Test-Path "$ProjectRoot\backend\.env") {
    Copy-Item "$ProjectRoot\backend\.env" "$BackupDir\.env.bak"
}
# 备份 SQLite DB（如果用的是SQLite；MySQL请改用 mysqldump）
$dbFile = Get-ChildItem -Path "$ProjectRoot\backend" -Filter "*.db" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($dbFile) {
    Copy-Item $dbFile.FullName "$BackupDir\$($dbFile.Name).bak"
}
Write-Host "  ✓ 备份目录: $BackupDir" -ForegroundColor Green

# Step 2: 拉代码
Write-Host "`n[2/7] 拉取最新代码..." -ForegroundColor Yellow
Set-Location $ProjectRoot
git fetch origin
git checkout main
git pull origin main
$lastCommit = git log -1 --oneline
Write-Host "  ✓ 当前 HEAD: $lastCommit" -ForegroundColor Green

# Step 3: 安装依赖
Write-Host "`n[3/7] 安装后端依赖..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\backend"
npm ci 2>&1 | Out-Null
Write-Host "  ✓ npm ci 完成" -ForegroundColor Green

# Step 4: 检查并写入新的 .env 变量
Write-Host "`n[4/7] 检查 .env 必需变量..." -ForegroundColor Yellow
$envFile = "$ProjectRoot\backend\.env"
$envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
if (-not $envContent) { $envContent = "" }

$needsAppend = @()
if ($envContent -notmatch "DEEPSEEK_DAILY_LIMIT=") {
    $needsAppend += "DEEPSEEK_DAILY_LIMIT=2000"
}
if ($envContent -notmatch "CRAWLER_ADMIN_KEY=") {
    # 生成32字节强密钥
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $adminKey = [Convert]::ToBase64String($bytes)
    $needsAppend += "CRAWLER_ADMIN_KEY=$adminKey"
    Write-Host "  ⚠ 生成了新的 CRAWLER_ADMIN_KEY（请保存）：" -ForegroundColor Yellow
    Write-Host "    $adminKey" -ForegroundColor Magenta
}
if ($envContent -notmatch "CRAWLER_SCHEDULER_ENABLED=") {
    $needsAppend += "CRAWLER_SCHEDULER_ENABLED=true"
}
if ($needsAppend.Count -gt 0) {
    Add-Content -Path $envFile -Value "`n# MVP β-场景新增配置（自动追加于 $(Get-Date -Format 'yyyy-MM-dd')）"
    foreach ($line in $needsAppend) {
        Add-Content -Path $envFile -Value $line
    }
    Write-Host "  ✓ 已追加 $($needsAppend.Count) 个 .env 变量" -ForegroundColor Green
} else {
    Write-Host "  ✓ .env 已包含所有必需变量" -ForegroundColor Green
}

# Step 5: 数据库迁移
Write-Host "`n[5/7] 应用 Prisma 数据库迁移..." -ForegroundColor Yellow
$migrateOutput = npx prisma migrate deploy 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ 迁移失败！服务未重启，生产仍在跑旧版本。" -ForegroundColor Red
    Write-Host $migrateOutput
    exit 1
}
npx prisma generate 2>&1 | Out-Null
Write-Host "  ✓ Schema 迁移完成（subType + camp_feedbacks）" -ForegroundColor Green

# Step 6: 构建
Write-Host "`n[6/7] 编译后端..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ 编译失败！服务未重启。" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ dist/ 构建完成" -ForegroundColor Green

# Step 7: 重启服务 + 健康检查
Write-Host "`n[7/7] 重启 baoyan-backend 服务..." -ForegroundColor Yellow
sc.exe stop baoyan-backend | Out-Null
Start-Sleep -Seconds 2
sc.exe start baoyan-backend | Out-Null
Start-Sleep -Seconds 5

$healthy = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/health" -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch { }
    Write-Host "  ... 健康检查重试 $i/5" -ForegroundColor Gray
    Start-Sleep -Seconds 3
}

if ($healthy) {
    Write-Host "  ✓ 服务健康！" -ForegroundColor Green
} else {
    Write-Host "  ✗ 服务未恢复！检查 C:\Users\Administrator\backend.log" -ForegroundColor Red
    Write-Host "    回滚命令: sc.exe stop baoyan-backend; git checkout 2dff614; npm run build; sc.exe start baoyan-backend" -ForegroundColor Yellow
    exit 1
}

# 提示后续验证步骤
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  ✅ 部署成功！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步：触发一次 P0 重抓验证新逻辑（约5-10分钟）" -ForegroundColor Yellow
Write-Host ""
$adminKeyFromEnv = (Get-Content $envFile | Where-Object { $_ -match "^CRAWLER_ADMIN_KEY=" }) -replace "CRAWLER_ADMIN_KEY=", ""
Write-Host "curl.exe -X POST http://127.0.0.1:3000/admin/camps/recrawl ``" -ForegroundColor White
Write-Host "  -H `"X-Admin-Key: $adminKeyFromEnv`" ``" -ForegroundColor White
Write-Host "  -H `"Content-Type: application/json`" ``" -ForegroundColor White
Write-Host "  -d '{\""priority\"":\""P0\""}'" -ForegroundColor White
Write-Host ""
Write-Host "重抓完成后:" -ForegroundColor Yellow
Write-Host "  1. 通过 https://baoyanwang-helper.cn 验证小程序看到新数据" -ForegroundColor White
Write-Host "  2. 查 DB 看 camp_infos 是否有 PKU/SJTU/USTC/FUDAN/RUC 新条目" -ForegroundColor White
Write-Host "  3. 看公告详情页底部是否出现'信息有误'按钮" -ForegroundColor White
Write-Host ""
