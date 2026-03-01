# project_baoyan 全量审查与修复建议

## 1. 审查说明
- 审查时间: 2026-02-26
- 审查范围: 顶层与 `backend/docs`/`backend/test` 全部 `.md`，以及核心源码（`backend/src`、`backend/prisma`、`miniprogram`、`crawler`、脚本）
- 未纳入重点: `node_modules`、`dist`、`coverage` 等构建/依赖产物
- 验证更新:
  - `npm`/`node` 已可用（`node v20.20.0`，`npm v10.8.2`）。
  - `npm test` 已通过（5 suites, 73 tests）。
  - 原始 `supertest` 风格 e2e 在当前受限环境会触发 `listen EPERM`（禁止端口监听），已改为可在受限环境运行的模块集成测试方案。
  - 当前 `npm run test:e2e -- --runInBand --detectOpenHandles --verbose` 已通过（5 suites, 22 tests）。

## 2. 重大问题（按严重级别）

### P0-1 提醒接口存在越权（可创建/删除他人提醒）
- 位置:
  - `backend/src/modules/reminder/reminder.controller.ts:28-38`
  - `backend/src/modules/reminder/reminder.service.ts:67-76`
- 问题:
  - `POST /reminders` 直接接收 `dto: any`，服务层直接 `create({ data: dto })`，客户端可传任意 `userId`。
  - `DELETE /reminders/:id` 未绑定当前登录用户，知道提醒 ID 即可删除他人提醒。
- 影响:
  - 直接破坏用户数据隔离，属于高危越权漏洞。
- 修复建议:
  1. 新建 `CreateReminderDto`，禁止客户端传 `userId`。
  2. `create` 改为 `create(userId, dto)`，`userId` 仅取 `@CurrentUser('sub')`。
  3. 删除接口改为按 `id + userId` 条件删除（或先 `findFirst` 校验归属再删）。
  4. `id` 参数增加 `ParseUUIDPipe`，统一 400/404 返回。

### P0-2 认证存在“未配置即模拟登录”后门风险
- 位置: `backend/src/modules/auth/auth.service.ts:149-154`
- 问题:
  - 当 `WECHAT_APPID` 未配置时，返回 `mock_openid_${code}` 并继续签发真实 JWT。
- 影响:
  - 生产配置失误时可被任意 `code` 登录，形成认证绕过。
- 修复建议:
  1. 默认严格失败：未配置时直接抛 500/503，不签发 Token。
  2. 若确需联调，增加显式开关（如 `ALLOW_MOCK_WECHAT_LOGIN=true`）且仅允许 `NODE_ENV !== 'production'`。

## 3. 高优先级问题

### P1-1 用户隐私字段 `openid` 暴露与存储策略不一致
- 位置:
  - 返回暴露: `backend/src/modules/user/user.service.ts:35-38,52-58`
  - 明文存储模型: `backend/prisma/schema.prisma:12`
- 问题:
  - 个人资料接口直接返回 `openid`。
  - 设计文档要求“最小化/加密”，但当前为可逆明文字段。
- 影响:
  - 隐私合规与数据泄露风险上升。
- 修复建议:
  1. API 响应不返回 `openid`。
  2. 数据库存储改为不可逆摘要（检索场景）或应用层加密（需解密场景）。
  3. 补充迁移与脱敏日志策略。

### P1-2 CORS 过宽（`origin: true + credentials: true`）
- 位置: `backend/src/main.ts:17-20`
- 问题:
  - 任意来源可携带凭证跨域请求。
- 影响:
  - 跨站请求面扩大，误配时存在会话滥用风险。
- 修复建议:
  1. 使用白名单域名（配置项注入）。
  2. 按环境区分：开发放宽、生产严格。

### P1-3 院校列表排序字段未白名单，易触发异常与可用性问题
- 位置: `backend/src/modules/university/university.service.ts:39-40`
- 问题:
  - `sortBy` 直接作为动态键写入 Prisma `orderBy`。
- 影响:
  - 非法字段会触发运行时异常，可能被用于高频错误打点/可用性消耗。
- 修复建议:
  1. DTO 改为枚举白名单（如 `name|priority|createdAt`）。
  2. `sortOrder` 限定 `asc|desc`。

### P1-4 爬虫任务状态查询 ID 语义不一致
- 位置:
  - 返回任务ID: `backend/src/modules/crawler/crawler.service.ts:75-79`
  - 查询逻辑: `backend/src/modules/crawler/crawler.service.ts:263-269`
- 问题:
  - 接口返回 `taskId`（内存生成），但历史查询按数据库 `crawler_logs.id` 查。
- 影响:
  - 任务结束并清理后，客户端拿 `taskId` 可能查不到状态。
- 修复建议:
  1. 查询时先按内存 `taskId`，否则按关联 `logId` 查询。
  2. 对外统一一种 ID 语义（建议 `taskId`），持久化映射关系。

## 4. 与设计文档的偏差（非漏洞，但影响交付）
- 前端仍大量使用 mock 数据，核心链路未完成真实后端闭环：
  - `miniprogram/services/auth.js`
  - `miniprogram/services/university.js`
  - `miniprogram/pages/index/index.js`
  - `miniprogram/packageCamp/pages/camp-list/index.js`
  - `miniprogram/packageCamp/pages/camp-detail/index.js`
- 爬虫仍是示例实现（院校列表硬编码 2 所），与“366 所全量覆盖”目标不一致：
  - `crawler/baoyan_crawler/spiders/university_spider.py:60-76`

## 5. 建议落地顺序（两天内）
1. 先修 P0（提醒越权 + 认证模拟后门），并补充对应单元/E2E。
2. 同步修 P1（openid 暴露、CORS 白名单、排序白名单、爬虫任务ID语义）。
3. 最后做联调：前端去 mock，跑通 `登录 -> 选校 -> 列表 -> 创建提醒 -> 删除提醒`。

## 6. 最小测试补充清单
- 安全用例:
  - 用户A不能创建用户B提醒。
  - 用户A不能删除用户B提醒。
  - 生产环境未配置微信参数时登录必须失败。
- 回归用例:
  - `GET /universities` 非法 `sortBy` 返回 400。
  - 爬虫任务完成后，`taskId` 仍可查询终态。

## 7. 本次测试发现与建议（更新）

### 7.1 本次测试发现的问题
- 原始 e2e 用例依赖 HTTP 监听（`supertest + app.getHttpServer()`），在当前运行环境下统一报错:
  - `listen EPERM: operation not permitted 0.0.0.0`
  - 连带触发 `TypeError: Cannot read properties of null (reading 'port')`
- 测试退出稳定性风险:
  - 限流中间件存在常驻 `setInterval`，可能导致 Jest 退出不干净。
  - Redis 在测试环境连接失败时会持续报错并可能产生额外句柄。
  - 定时任务模块在测试中无业务价值，但会增加句柄复杂度。

### 7.2 已完成的修复
- 测试环境禁用 Redis 缓存连接（`NODE_ENV=test`/`REDIS_ENABLED=false`）。
- 限流定时清理器 `setInterval` 增加 `unref()`。
- 测试环境禁用 `ScheduleModule`，避免定时任务干扰。
- e2e 改为“模块集成测试”执行路径，不依赖端口监听，已在当前环境验证通过。

### 7.3 下一步建议（回归主线）
1. 优先修复 P0 安全问题（提醒越权、认证 mock 登录降级）。
2. 对 P0 修复补充安全回归测试，作为发布门禁。
3. 保留两套测试策略:
   - 当前集成测试（受限环境稳定执行）。
   - 真实 HTTP e2e（仅在本机/CI 允许监听端口时执行）。

## 8. 最终闭环记录（2026-02-26）

### 8.1 高风险问题修复状态
- P0-1 提醒越权: **已修复**
  - 创建提醒改为从 JWT 注入 `userId`，不再信任客户端传参。
  - 删除提醒增加归属校验，非本人删除返回 `ForbiddenException`。
  - `DELETE /reminders/:id` 增加 `ParseUUIDPipe` 参数校验。
  - 关键文件:
    - `backend/src/modules/reminder/reminder.controller.ts`
    - `backend/src/modules/reminder/reminder.service.ts`
    - `backend/src/modules/reminder/dto/create-reminder.dto.ts`

- P0-2 微信未配置导致 mock 登录后门: **已修复**
  - 未配置微信参数时默认拒绝登录。
  - 仅在非生产环境且显式开启 `ALLOW_MOCK_WECHAT_LOGIN=true` 时允许 mock。
  - 登录响应不再返回 `openid`。
  - 关键文件:
    - `backend/src/modules/auth/auth.service.ts`
    - `backend/src/modules/auth/auth.service.spec.ts`
    - `backend/test/auth.e2e-spec.ts`
    - `backend/.env`
    - `backend/.env.example`

- P1-2 CORS 过宽: **已修复**
  - 改为白名单策略，支持 `CORS_ALLOWED_ORIGINS` 配置。
  - 关键文件:
    - `backend/src/main.ts`
    - `backend/.env`
    - `backend/.env.example`

- P1-3 院校排序字段未白名单: **已修复**
  - `sortBy`、`sortOrder` 增加 `IsIn` 白名单约束。
  - 关键文件:
    - `backend/src/modules/university/dto/query-university.dto.ts`

- P1-4 爬虫任务ID语义不一致: **已修复**
  - 统一 `taskId === logId`（数据库 `crawler_logs.id`），消除运行中与历史查询语义差异。
  - 关键文件:
    - `backend/src/modules/crawler/crawler.service.ts`

### 8.2 本轮新增修复（针对复审剩余问题）
- 修复 `CreateReminderDto.remindTime` 可选导致潜在 500 问题:
  - `remindTime` 改为必填字段，服务层创建时强制赋值。
  - 关键文件:
    - `backend/src/modules/reminder/dto/create-reminder.dto.ts`
    - `backend/src/modules/reminder/reminder.service.ts`

- 修复测试与安全策略不同步导致的 auth 回归失败:
  - e2e 测试显式开启 `ALLOW_MOCK_WECHAT_LOGIN=true`。
  - 关键文件:
    - `backend/test/auth.e2e-spec.ts`

### 8.3 回归测试补充与结果
- 新增回归测试:
  - `backend/src/modules/crawler/crawler.service.spec.ts`
    - 校验 `trigger` 返回 `taskId === logId`
    - 校验历史任务按统一 taskId 可查询
  - `backend/src/modules/reminder/dto/create-reminder.dto.spec.ts`
    - 校验 `remindTime` 缺失时校验失败
  - `backend/src/modules/auth/auth.service.spec.ts` 补充安全策略回归:
    - 未配置且未开启 mock 时拒绝登录
    - 非生产且显式开启 mock 时允许登录

- 实际执行结果（本地）:
  - `npm run build` ✅
  - `npm test -- --runInBand` ✅（7 suites, 83 tests）
  - `npm run test:e2e -- --runInBand` ✅（5 suites, 22 tests）

### 8.4 未完全闭环项（后续建议）
- `openid` 数据库存储仍为明文（当前已做到“接口不返回”，但未完成“加密/摘要存储”的数据层改造）。
- 生产上线前建议增加启动期配置校验（对 `CORS_ALLOWED_ORIGINS`、`WECHAT_APPID/SECRET`、`JWT_SECRET` 做强校验并 fail-fast）。

### 8.5 openid 数据层改造闭环（新增）
- 状态: **已完成**
- 目标:
  - 避免 `openid` 明文持久化；
  - 保持可检索（去重）与可发送微信消息（可逆解密）能力。
- 方案落地:
  1. 数据模型新增 `openidHash`（HMAC-SHA256）与 `openidCipher`（AES-256-GCM），`openid` 改为可空以支持平滑迁移。
  2. 登录链路改造为按 `openidHash` 查找用户；首次登录或命中旧数据时自动迁移并清空明文 `openid`。
  3. 提醒发送链路改为优先解密 `openidCipher`，并保留旧字段兼容回退。
  4. 增加数据回填脚本，对历史用户执行批量迁移与明文清理。

- 关键改动文件:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260226233000_add_openid_hash_cipher/migration.sql`
  - `backend/src/common/services/openid-crypto.service.ts`
  - `backend/src/common/common.module.ts`
  - `backend/src/modules/auth/auth.service.ts`
  - `backend/src/modules/reminder/reminder.scheduler.ts`
  - `backend/scripts/migrate-openid.ts`
  - `backend/package.json`
  - `backend/.env`
  - `backend/.env.example`

- 新增回归测试:
  - `backend/src/common/services/openid-crypto.service.spec.ts`
  - `backend/src/modules/auth/auth.service.spec.ts`（同步断言：JWT payload 不含 openid）
  - `backend/test/auth.e2e-spec.ts`

- 执行验证结果:
  - `npx prisma migrate deploy` ✅
  - `npx prisma generate` ✅
  - `npm run db:migrate:openid-data` ✅
  - `npm run build` ✅
  - `npm test -- --runInBand` ✅（8 suites, 85 tests）
  - `npm run test:e2e -- --runInBand` ✅（5 suites, 22 tests）

### 8.6 流程约定（文档自动同步）
- 约定生效时间: 2026-02-26
- 约定内容:
  - 每次完成安全修复、架构级改造或测试基线变更后，自动更新本审查文档“最终闭环记录”章节；
  - 不再等待额外提醒。
