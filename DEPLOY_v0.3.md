# 部署 v0.3 — 按需点对点抓取上线手册

**目标**: 把"按需点对点抓取 + AI 匹配 + 体验版小程序"上线到 `baoyanwang-helper.cn`
**承诺**: **不带任何 mock 数据上生产**

---

## 0. 当前线上拓扑

- 服务器：Windows Server 2022 (111.231.64.155)
- 域名：https://baoyanwang-helper.cn (Caddy 反代)
- 后端服务：NSSM `baoyan-backend` (端口 3000)
- DB：MySQL（生产）/ SQLite（dev）
- 项目目录：`C:\Users\Administrator\project_baoyan`

---

## 1. 上线前阻断项（Blockers）

| # | 阻断项 | 解决方案 | 状态 |
|---|---|---|---|
| B1 | crawl-queue 是 mock 数据 | 替换为 spawn scrapy 子进程 | 🔴 待做 |
| B2 | AI 匹配 mock 也会写假 MatchResult | 抓取完成后用真 LLM 跑匹配 | 🔴 待做 |
| B3 | spider 不支持按学院定点 | 加 `dept_ids` 参数，按 Department.homepage 构造入口 | 🔴 待做 |
| B4 | Department 表的 1147 条数据没 seed 到生产 | 部署脚本里跑 `seed-from-university-departments.ts` | 🔴 待做 |
| B5 | Prisma schema 改了但没生成 migration | 生成 `add_crawl_jobs` migration SQL | 🔴 待做 |
| B6 | 新用户 auto mock 档案的代码会跑 | 用 `ALLOW_MOCK_WECHAT_LOGIN` 环境变量门控（已是这样）| 🟢 OK |
| B7 | mini-program `USE_LOCAL_BACKEND=true` | 部署前改 false | 🔴 待做 |

---

## 2. 实施阶段

### Phase 1: Spider 真实接入（1-2 天）

**P1a 修 spider 接 `dept_ids` 参数**
- spider 接受 `--dept_ids=pku-cs,sjtu-ai,...`
- 调后端 `/api/v1/internal/departments/by-ids` 拿 Department.homepage/noticeUrl
- `build_urls()` 改为每个 dept 用其 homepage + 探测路径

**P1b 后端 ingest 支持 departmentId**
- `CrawlerCampItemDto` 加 `departmentId?: string`
- `crawler.service.ts upsertCamp` 写入 `departmentId`
- 新增 internal endpoint 给 spider 调

**P1c crawl-queue 替换 mock 为真实调用**
- `runJob()` 用 `child_process.spawn` 起 `scrapy crawl university -a dept_ids=...`
- 设超时 (默认 25min)
- 子进程完成后查 DB：对该 job 的 dept 列表筛选这次抓到的 CampInfo
- 失败/超时：把 job 标 `partial` 或 `failed`，写 errorMsg
- **删掉所有 mock 数据生成代码**

**P1d 自动 AI 匹配**
- crawl-queue 完成后，对该 job 的所有订阅用户 × 新增 camps：调 `llmAssistant.analyzeCampForUser()` 真实跑 LLM 匹配
- 写入 `CampMatchResult`（用真实 LLM 输出，不是 mock）
- LLM mock fallback 通过 `ALLOW_MOCK_WECHAT_LOGIN` 环境变量门控，生产关闭

### Phase 2: 部署脚本（0.5 天）

**P2a Prisma migration**
- 在 dev 用 sqlite 生成 baseline migration（针对新加的 CrawlJob、DepartmentCrawlCache、UserSelection.departmentSelections、CampInfo.departmentName）
- 兼容 MySQL：手写 SQL（MySQL 跟 SQLite 在某些字段类型上不同）

**P2b PowerShell 一键部署 `deploy/deploy-v0.3.ps1`**
```
1. cd C:\Users\Administrator\project_baoyan
2. git pull origin refactor/ai-assistant
3. backend: npm install (新增依赖)
4. backend: npx prisma migrate deploy
5. backend: 跑 seed-from-university-departments.ts（幂等）
6. backend: npm run build
7. crawler: pip install -r requirements.txt（如有新增）
8. 重启 NSSM: sc stop baoyan-backend && sc start baoyan-backend
9. 等 5s health check: curl https://baoyanwang-helper.cn/health
10. 输出验证清单（路由、DB 表、新数据）
```

### Phase 3: 小程序体验版（0.5 天）

**P3a 发版前 checklist**
- [ ] `app.js` 的 `USE_LOCAL_BACKEND` 改为 `false`
- [ ] 清除 console.log 调试输出（如有）
- [ ] 检查所有 `/api/v1/...` 路径正确
- [ ] 检查不引用 mock-only 字段（如 "(mock #1)" 后缀的 fallback）
- [ ] 微信开发者工具点「上传」→ 备注版本号 `v0.3-experience-{date}`
- [ ] 设置体验版二维码，发到测试群

**P3b 发布后第 1 天巡检**
- [ ] 后台 `tail -f` 看新用户登录是否成功
- [ ] 后台看是否有 CrawlJob 被创建 + 跑通
- [ ] 至少 1 个完整的 dept-selector → 抓取 → 收藏闭环

---

## 3. 回退方案

如生产事故：
1. NSSM 启动旧 commit：`git checkout <prev-tag> && npm run build && sc restart baoyan-backend`
2. DB schema 回退：`prisma migrate resolve --rolled-back add_crawl_jobs`
3. 小程序：在微信小程序管理后台手动回滚到上一版

---

## 4. 时间表

| 阶段 | 耗时 | Owner | 状态 |
|---|---|---|---|
| P1a-c spider + crawl-queue 真实接入 | 1 天 | Claude | ✅ 完成 |
| P1d AI 匹配自动化 | 0.5 天 | Claude | ✅ 完成 |
| P2 migration + deploy script | 0.5 天 | Claude | ✅ 完成 |
| P3a miniprogram checklist + upload | 0.5 天 | you | 🟡 进行 |
| P3b 发布 + 第 1 天巡检 | 1 天 | you | ⏳ 等部署后 |

---

## 5. 你执行的步骤（按顺序）

### 5.1 服务器端（约 10-20 分钟）

1. **RDP 登陆 Windows Server**（111.231.64.155）

2. **`backend/.env` 加 2 个新变量**（关键！）：
   ```
   INTERNAL_API_TOKEN=<生成一个 32 位随机字符串，例如 openssl rand -hex 16>
   PYTHON_CMD=python.exe       # 或具体路径如 C:\Python39\python.exe
   CRAWLER_DIR=C:\Users\Administrator\project_baoyan\crawler
   ```

3. **`crawler/.env` 同步**（或者环境变量）：
   ```
   CRAWLER_BACKEND_BASE_URL=http://127.0.0.1:3000
   INTERNAL_API_TOKEN=<同上，与 backend 一致>
   ```

4. **拉代码** + **跑部署脚本**：
   ```powershell
   cd C:\Users\Administrator\project_baoyan
   git fetch origin
   git checkout refactor/ai-assistant
   git pull origin refactor/ai-assistant
   .\deploy\deploy-v0.3.ps1
   ```
   脚本会：
   - 检查 NSSM 服务存在
   - `git pull` + `npm install` + `prisma migrate deploy`
   - 跑 `seed-from-university-departments.ts`（导 1147 个院系）
   - `nest build`
   - `pip install -r requirements.txt`（crawler）
   - 重启 `baoyan-backend` 服务
   - 5 次重试 `/health`
   - 输出新路由清单

5. **本地验证**（不需要小程序）：
   ```powershell
   # 测一个学院 (sjtu-ai) 的内部接口
   curl.exe -H "X-Internal-Token: <你的 token>" `
     "http://127.0.0.1:3000/api/v1/internal/departments/by-ids?ids=sjtu-ai"
   # 应返回 {"departments":[{...sjtu-ai 信息}]}

   # 测主接口（HTTPS）
   curl.exe "https://baoyanwang-helper.cn/api/v1/health"
   ```

### 5.2 小程序发版

1. **本地最后一次拉代码**到你开发机：
   ```bash
   git checkout refactor/ai-assistant && git pull
   ```

2. **微信开发者工具**打开 `miniprogram/` 目录

3. **再次确认** `miniprogram/app.js` 第 32 行附近：
   ```js
   const USE_LOCAL_BACKEND = false   // ✅ 必须 false
   ```

4. **工具栏 → 上传**：
   - 版本号：`v0.3-experience-{YYYYMMDD}`
   - 项目备注："按需点对点抓取 + 探探卡 + 退出登录"

5. **微信小程序管理后台** → 版本管理 → 设为体验版（不提交审核）

6. **生成体验版二维码**，发给自己 + 1-2 个内测同学

### 5.3 发布后 24 小时内必看

- [ ] 服务器 `tail backend.log` 看是否有新用户登录
- [ ] DB 查 `SELECT * FROM crawl_jobs ORDER BY createdAt DESC LIMIT 5`
- [ ] DB 查抓到的真实公告 `SELECT id,title,universityId,departmentId FROM camp_infos WHERE departmentId IS NOT NULL ORDER BY createdAt DESC LIMIT 10`
- [ ] DB 查 AI 匹配 `SELECT COUNT(*) FROM camp_match_results WHERE llmModel IS NOT NULL AND llmModel != 'mock-v0'`
- [ ] DeepSeek 控制台看 API 调用量
- [ ] 自己走一遍：选 1 学院 → 看进度 banner → 看抓到的真实公告（或合理空结果）

---

## 6. 故障速查

| 症状 | 排查 |
|---|---|
| `/health` 返回 502 | `Get-Service baoyan-backend` 看服务状态，看 `backend.log` 末尾 |
| 抓取 job 一直 running | 看 `backend.log` 找 `[job xxx] spawn:` 行；找 `python` 进程；检查 `INTERNAL_API_TOKEN` 是否一致 |
| spider 启动失败 `Cannot find module 'scrapy'` | crawler 目录跑 `pip install -r requirements.txt` |
| 抓到 0 条但日志正常 | 学院 homepage 可能变更，反馈通道会收到用户报错 |
| AI 匹配不出 | 检查 `DEEPSEEK_API_KEY` 是否真实有效；看 DeepSeek 限额 |
| 小程序无法登录 | 检查 `WECHAT_APPID`/`WECHAT_SECRET` 是否正确；`ALLOW_MOCK_WECHAT_LOGIN` 必须为 `false` |

---

## 7. 回滚

```powershell
cd C:\Users\Administrator\project_baoyan
git log --oneline -n 5             # 找回滚前的 commit
git checkout <prev-commit-hash>
cd backend
npm run build
sc.exe stop baoyan-backend
sc.exe start baoyan-backend

# DB 回滚（必要时）
npx prisma migrate resolve --rolled-back 20260516000000_add_crawl_jobs
# 但表数据不会自动删除；如需清理：
# sqlite3 prisma/dev.db "DROP TABLE crawl_jobs; DROP TABLE department_crawl_caches;"
```

小程序回滚：微信公众平台 → 小程序管理后台 → 版本管理 → 回滚到上一审核通过版。
