# 保研助手 v0.2 重构 - 前端校验指南

> v0.2 核心思路：从"通用聚合工具" 转为 **"AI 保研助理"** —— 用户告知关注哪些学校的哪些院系，AI 帮判断公告匹配度。

---

## 一、本地启动步骤

### 1. 后端启动

```bash
cd backend

# 1. 确保 Prisma client 已生成（不必跑迁移，因为暂时只在本地）
npx prisma generate

# 2. 数据库迁移（在你的本地 SQLite 上添加新表）
# 注意：你可以选择以下任一方案
# 方案A：本地完全重建（清空数据）
npx prisma migrate reset --skip-seed

# 方案B：保留数据，只增量加新表（更安全）
npx prisma migrate deploy

# 3. 把 5 校×院系 配置导入 DB
npx ts-node prisma/seed-departments.ts

# 4. 启动后端
npm run start:dev
```

后端启动后访问 http://127.0.0.1:3000/health 应该返回 `{"status":"healthy"}`。

### 2. .env 必需配置

```env
DEEPSEEK_API_KEY=sk-xxxx          # 必填，AI 助理依赖
DEEPSEEK_API_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DATABASE_URL="file:./prisma/dev.db"   # 本地 SQLite
```

如果当前 `.env` 已有这些就不用改。

### 3. 小程序启动

在微信开发者工具：
1. 打开项目 → 工具栏 → 详情 → 清缓存 → 全部清除
2. 工具栏 → 编译（Ctrl+B / Cmd+B）

如果工具报错"找不到 packageAssistant"，确认 `app.json` 已注册（应该已经更新）。

---

## 二、核心新增/修改清单

### 后端新增
- `backend/src/modules/assistant/` 整个新模块
  - `llm-assistant.service.ts` — LLM Agent（拿公告+档案→输出匹配判断）
  - `url-fetcher.service.ts` — 拉取 URL 原文
  - `assistant.controller.ts` — `POST /api/v1/assistant/submit-url` 等核心端点
  - `subscription.controller.ts` — `/api/v1/subscription/*` 院系订阅
  - `profile.controller.ts` — `/api/v1/profile` 档案 CRUD
- `backend/prisma/schema.prisma` — 新增 3 张表：`Department` / `UserDepartmentSubscription` / `CampMatchResult`，并扩展 `UserProfile` 加 `targetMajors`
- `backend/prisma/migrations/20260515000000_refactor_ai_assistant/`
- `backend/prisma/seed-departments.ts` — 从配置文件入库

### 共享配置新增
- `shared/department-config.json` — 5 校 × 70 院系 × 91 专业

### 小程序新增
- `miniprogram/styles/design-tokens.wxss` — 设计系统（颜色/间距/字号/阴影）
- `miniprogram/services/assistant.js` / `profile-v2.js` / `subscription.js` — 新 service
- `miniprogram/packageAssistant/pages/` — 新 4 个页面：
  - `profile-edit/` — 档案编辑（中档案，5字段必填+推荐填）
  - `dept-selector/` — 选校×院系（带 AI 推荐 + 一键全选）
  - `submit-url/` — 提交 URL 让 AI 分析
  - `match-detail/` — 匹配详情（AI 判断 + 要求逐项）
- `miniprogram/pages/index/` — 首页重写为"今日新机会"
- `miniprogram/pages/my/` — 我的页重写为简洁菜单
- `miniprogram/app.json` — tabBar 改为 2 个（新机会 + 我的）

### 暂保留（未删除，但已脱离主流程）
- 旧的 `packageCamp` / `packageSelector` / `packageReminder` / `packageProgress` 子包
- 旧 `services/camp.js` 等
- 旧的爬虫代码（`crawler/`）
- 旧的后端 controller（`camp.controller.ts` 等仍可用）

**这些会在 v0.3 阶段（用户验证完 v0.2 后）才删除。**

---

## 三、可执行的前端校验场景

### 场景 1：首次使用引导
1. 清空缓存后打开首页
2. 期望：看到 3 步引导卡片（填档案 / 选院系 / 享受筛选）
3. 点"填写档案"→ 进入档案编辑页
4. 必填：本科学校 / 本科专业 / GPA / 至少 1 个目标专业（点 chip 或填补充）
5. 保存 → 回到首页
6. 点"选择院系"→ 进入院系选择页
7. 期望：能看到 AI 推荐 chip（基于你的目标专业），点"一键全选 AI 推荐"
8. 保存 → 回到首页

### 场景 2：手动测试 AI 助理（核心验证）
1. 首页点"手动测试 AI 助理"卡片
2. 在 submit-url 页贴一个公告 URL（如 https://stl.pku.edu.cn/cn/news/admissions/a3856.html）
3. 点"开始 AI 分析"
4. 等约 5-15 秒
5. 跳转到匹配详情页，期望看到：
   - 顶部"AI 推荐你申请" / "可以参考" / "建议跳过"badge
   - 匹配分数（0-100）
   - AI 推理总结一句话
   - 学校 / 院系 / 类型元数据
   - 截止时间 / 营期 / 地点
   - 要求逐项对比（✓✕!）+ 解释
   - 复制原文链接按钮
   - 底部"跳过 / 感兴趣"
6. 点"感兴趣"→ Toast 提示已收藏
7. 回到首页"已收藏"tab → 应该看到这条

### 场景 3：档案完整度
1. 进入档案编辑页
2. 期望：顶部进度条显示完整度（0-100%）
3. 添加/删除目标专业 chip → 完整度实时变化
4. 完整度 < 50 时提示"建议补全英语成绩和目标专业"

### 场景 4：院系订阅推荐
1. 先填好档案（目标专业 = 计算机科学与技术 + 人工智能）
2. 进入院系选择页
3. 期望：顶部 AI 推荐区显示北大-信科院、上交-电院等 chip
4. 点单个推荐 chip → 该院系被勾选
5. 点"一键全选 AI 推荐"→ 所有推荐院系都被勾选

### 场景 5：UI 设计验证
- 整体配色：主蓝紫色 #4F46E5
- 卡片间距：呼吸感强，留白足
- 字号层级清晰：标题/正文/辅助
- 圆角统一：卡片 16rpx
- 阴影：轻量柔和

---

## 四、还未做的（v0.2 范围外）

- ❌ 定时爬虫调度（5 校×院系精爬）— v0.3 实现
- ❌ 微信订阅消息推送（截止前提醒）— 复用旧的 ReminderScheduler，但需要重新接入新数据源
- ❌ 删除旧代码（camp 模块/旧爬虫等）— 等用户验证完 v0.2 再统一砍
- ❌ 院系级 noticeUrl 的实际可达性验证 — `shared/department-config.json` 的 URL 是基于 URL pattern 写的，需要 v0.3 实际爬取时验证

---

## 五、Token 成本预估

LLM 使用 DeepSeek，每次 submit-url 分析：
- 公告原文（6000 字符内）+ 档案 + system prompt ≈ 1500-2500 input tokens
- 输出 ≈ 400-800 tokens
- 单次成本约 ¥0.002-0.004
- DAILY_LIMIT=2000 足够 500 个用户日均 4 次分析

---

## 六、回退路径（如果验证失败）

```bash
# 完全回到 v0.1 重构前状态
git checkout v0.1-before-refactor

# 如果数据库已迁移想还原（DESTRUCTIVE）
cd backend
rm prisma/dev.db
npx prisma migrate deploy
npx ts-node prisma/seed.ts
```

---

## 七、下一步建议

灰度场景验证后，根据结果决定：

| 验证结果 | 下一步 |
|---------|-------|
| ✅ AI 判断准确 + UI 体验流畅 | v0.3：实现定时爬虫精爬 5 校院系 + 自动推送 |
| ⚠️ AI 偶有不准但思路对 | 优化 prompt + 让用户能纠错（"判断有误"反馈） |
| ❌ AI 判断完全不准 | 重新讨论：是否需要"半人工辅助"模式 |

---

**v0.2 工程量统计**：
- 后端新增 6 个文件 / 修改 3 个文件 / Prisma schema 增 3 表
- 前端新增 4 个页面 / 重写 2 个页面 / 新增 3 个 service / 新增 1 个设计系统
- 总代码量：约 2500 行（新增），约 200 行（修改）
- 测试：133 / 133 通过 ✅
