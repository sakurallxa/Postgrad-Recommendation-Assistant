# 保研项目测试报告（2026-03-05）

## 1. 测试目标与范围

- 目标：基于当前 `main` 分支代码与最近变更，完成可执行自动化测试，并给出边界覆盖情况与风险提示。
- 代码基线：
  - 分支：`main`
  - 最近提交：`7abc95d`
  - 重点变更：`backend/src`、`miniprogram`、`crawler`（`git diff --stat` 显示 63 文件，`+9971/-1408`）
- 本次覆盖：
  - 后端：`backend/src` 与 `backend/test` 全量可执行测试
  - 小程序：测试入口核查
  - Python 爬虫：测试文件与 `pytest` 入口核查

## 2. 测试策略（分层）

- L0 构建校验：TypeScript/Nest 构建是否通过
- L1 单元测试：业务服务、DTO、安全逻辑
- L2 集成/e2e：数据库与模块集成行为
- L3 覆盖率分析：识别测试盲区（高风险模块）
- L4 边界补充核查：对高风险路径做额外命令验证（非生产改动）

## 3. 执行记录与结果

### 3.1 后端构建与自动化测试

1. `npm run build`（目录：`backend`）
   - 结果：通过

2. `npm test -- --runInBand`（目录：`backend`）
   - 结果：通过
   - 统计：`9/9` suites，`98/98` tests 通过

3. `npm run test:e2e -- --runInBand`（目录：`backend`）
   - 结果：通过
   - 统计：`5/5` suites，`24/24` tests 通过

4. `npm run test:cov -- --runInBand`（目录：`backend`）
   - 结果：通过
   - 统计：`9/9` suites，`98/98` tests 通过
   - 覆盖率（关键项）：
     - 全局：Statements `30.47%` / Branch `25.71%`
     - `auth.service.ts`：Statements `93.05%`
     - `reminder.service.ts`：Statements `96.55%`
     - `crawler.service.ts`：Statements `61.1%`
     - `progress.service.ts`：Statements `16.07%`
     - `reminder.scheduler.ts`：Statements `0%`

### 3.2 子项目测试入口核查

1. `npm test`（目录：`miniprogram`）
   - 结果：失败（脚本本身定义为 `Error: no test specified`）
   - 结论：小程序当前无自动化测试

2. `python3 -m pytest -q crawler`
   - 结果：`no tests ran`
   - 结论：Python 爬虫目录当前无可发现测试用例

## 4. 边界条件覆盖情况（已覆盖）

- 认证模块
  - 空 `code`、`null code`、无效 token、用户不存在、mock 登录安全开关
- 夏令营模块
  - `status=all`、按年份筛选、分页边界、不存在资源 404
- 提醒模块
  - 未授权访问、删除越权、分页与状态筛选、最大返回条数约束
- 用户模块
  - 无效院校/专业 ID、并发更新、无选择数据、无效 JSON 兼容
- 进展模块
  - 非法状态流转、订阅过滤下的提醒分发
- 爬虫模块
  - 任务 ID 语义一致性、基线事件产出、更新差异事件、DeepSeek 兜底分支

## 5. 高风险问题与证据

### P1-1：Reminder 创建逻辑与 Prisma Schema 不一致（已复现）

- 现象：`ReminderService.create` 在 `dto.content` 存在时写入 `data.content`，但 `Reminder` 模型无 `content` 字段。
- 代码位置：
  - `backend/src/modules/reminder/reminder.service.ts:82-84`
  - `backend/prisma/schema.prisma:226-250`
- 复现验证：
  - 通过 `node` 调用 Prisma `reminder.create` 传 `content`，返回 `Unknown argument content`。
- 影响：带 `content` 的创建提醒请求可能在运行时报错。

### P1-2：Progress 模块改动大但测试覆盖不足

- 现象：`progress.service.ts` 超大规模逻辑（状态机、订阅、匹配、动作 token），但单测仅 2 个用例。
- 代码位置：
  - `backend/src/modules/progress/progress.service.ts`（主体逻辑）
  - `backend/src/modules/progress/progress.service.spec.ts:69-158`（仅两个场景）
- 指标证据：coverage 中 `progress.service.ts` Statements `16.07%`。
- 影响：复杂路径（自动推进、名单匹配、snooze/consume token）回归风险高。

### P1-3：e2e 测试以 Service 调用为主，HTTP 层验证不足

- 现象：e2e 用例主要直接调用 service，而非通过 HTTP 接口验证 DTO + Pipe + Guard 全链路。
- 代码位置：
  - `backend/test/university.e2e-spec.ts:55-85`
  - `backend/test/camp.e2e-spec.ts:76-123`
  - `backend/test/reminder.e2e-spec.ts:84-125`
- 影响：控制器参数解析、验证管道、序列化行为仍可能存在线上差异。

### P2-1：University 查询 DTO 的数值转换风险

- 现象：`page/limit` 使用 `@IsNumber()`，但未显式 `@Type(() => Number)`；若走 HTTP Query，字符串入参可能触发校验歧义。
- 代码位置：
  - `backend/src/modules/university/dto/query-university.dto.ts:14-25`
  - `backend/src/modules/university/university.controller.ts:11-15`
- 影响：线上可能出现参数校验不稳定（取决于 transform 行为和入参格式）。

### P2-2：定时调度与外部依赖路径缺少自动化验证

- 现象：
  - `reminder.scheduler.ts` 未覆盖（coverage 0%）
  - `crawler` 的 Scrapy 子进程执行链路无集成测试
- 代码位置：
  - `backend/src/modules/reminder/reminder.scheduler.ts`
  - `backend/src/modules/crawler/crawler.service.ts`
- 影响：依赖环境（微信、Scrapy、网络）变化时，生产行为不可预测。

### P2-3：前端与 Python 爬虫无自动化回归网

- 现象：
  - `miniprogram` 无测试脚本
  - `crawler` 无 pytest 用例
- 影响：UI 与爬虫规则升级依赖手工验证，回归发现滞后。

## 6. 结论（当前版本）

- 后端现有自动化测试：全部通过（`122/122`）。
- 构建状态：通过。
- 质量门禁建议：`有条件通过`。
  - 条件：优先修复 `Reminder content 字段不一致`，并补齐 Progress/HTTP 层关键回归用例后再做发布门禁放行。

## 7. 建议的下一轮补测清单（优先级）

1. P0：新增 Reminder e2e（带 `content`）并修复 schema/service 不一致。
2. P0：新增 Progress e2e（create/updateStatus/confirmStep/createEvent/consumeActionToken）。
3. P1：新增基于 HTTP 的 controller e2e，覆盖 Query/Body/Guard/Pipe 组合。
4. P1：新增 ReminderScheduler 的可控时钟单测与微信发送失败重试测试。
5. P2：为 miniprogram 增加最小化单测（service 层）和关键页面 smoke 测试。
6. P2：为 crawler 增加 pytest（规则解析、结构化字段校验、事件推断）。

---

## 8. 本轮修复与复测（2026-03-05 夜间）

### 8.1 已完成修复

- 修复 `ReminderService.create` 写入 Prisma 不存在字段 `content` 的问题（避免运行时 `Unknown argument content`）。
  - 文件：`backend/src/modules/reminder/reminder.service.ts`

### 8.2 新增 e2e 覆盖

- 新增 `progress` 集成用例：`backend/test/progress.e2e-spec.ts`
  - 创建进展并校验订阅/关注与截止提醒
  - 非法状态流转校验
  - confirmStep 推进校验
  - change_event 分发提醒校验
- 新增 `reminder(content)` 兼容用例：`backend/test/reminder.e2e-spec.ts`
  - 传入 `content` 时创建提醒应成功

### 8.3 复测结果

- `npm test -- --runInBand`：`9/9` suites，`98/98` tests 通过
- `npm run test:e2e -- --runInBand`：`6/6` suites，`29/29` tests 通过
- `npm run build`：通过

### 8.4 风险状态更新

- `P1-1`（Reminder content 字段不一致）已关闭。
- `P1-2`（Progress 覆盖不足）已缓解但未完全关闭：新增了关键链路 e2e，仍建议继续补 HTTP 层与结果事件复杂分支（action token / auto match）回归。

---

## 9. Progress HTTP-supertest e2e 补充（本轮新增）

### 9.1 新增文件

- `backend/test/progress-http.e2e-spec.ts`

### 9.2 覆盖点（设计）

- Guard：
  - 无 token -> 401
  - 非法 token -> 401
- DTO：
  - `POST /progress` 非 UUID campId -> 400
  - `PATCH /progress/:id/status` 非法 status 枚举 -> 400
  - `POST /progress/events` 缺必填字段 -> 400
  - `POST /progress/actions/consume` 缺 token -> 400
- Pipe：
  - `GET /progress?page=abc` -> 400（ParseIntPipe）
  - `PATCH /progress/not-a-uuid/status` -> 400（ParseUUIDPipe）
- 业务链路：
  - 创建进展 + 列表查询
  - 合法/非法状态流转
  - 订阅更新
  - 变更事件创建与提醒分发
  - consume 未知 token -> 404

### 9.3 执行说明

- 在当前沙箱环境（禁止本地端口监听，`listen EPERM`）下，supertest 无法真正发起 HTTP 请求；测试已内置环境探测，遇到该限制时自动跳过请求执行步骤并输出警告。
- 在可监听端口的标准开发/CI 环境，上述 HTTP 用例将按预期完整执行。
