# 保研信息助手小程序 - MVP核心功能开发计划

**文档版本**: v1.0  
**制定日期**: 2026-02-25  
**计划周期**: 4周（2026-02-25 至 2026-03-25）  

---

## 1. 开发目标

完成MVP版本所有高优先级核心功能（26个功能点），确保产品能够：
1. 用户通过微信登录并保存院校/专业选择
2. 展示精准的夏令营信息列表（支持筛选）
3. 提供截止提醒功能（微信订阅消息）
4. 数据通过爬虫服务自动更新

---

## 2. 技术栈确认

### 2.1 后端服务
- **框架**: NestJS 10.x (Node.js 20 LTS)
- **数据库**: MySQL 8.0 + Prisma ORM 5.x
- **缓存**: Redis 7.0
- **认证**: JWT + 微信登录
- **文档**: Swagger/OpenAPI
- **测试**: Jest

### 2.2 爬虫服务
- **框架**: Python 3.11 + Scrapy 2.11
- **AI提取**: DeepSeek API
- **调度**: APScheduler

### 2.3 前端（已存在）
- **框架**: 微信小程序原生
- **状态管理**: MobX

---

## 3. Git分支策略

```
main (主干分支，稳定版本)
  │
  ├── develop (开发分支，日常集成)
  │     │
  │     ├── feature/week1-infra (Week 1: 基础设施)
  │     ├── feature/week2-api (Week 2: 核心API)
  │     ├── feature/week3-crawler (Week 3: 爬虫服务)
  │     ├── feature/week4-reminder (Week 4: 提醒功能)
  │     └── feature/fe-api-integration (前端API对接)
  │
  └── hotfix/* (紧急修复分支)
```

### 分支规范

| 分支类型 | 命名规范 | 来源 | 合并目标 |
|----------|----------|------|----------|
| 主干 | `main` | - | - |
| 开发 | `develop` | main | main |
| 功能 | `feature/功能描述` | develop | develop |
| 修复 | `hotfix/问题描述` | main | main + develop |

### 提交规范
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type类型**:
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式调整
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**:
```
feat(api): 实现用户登录接口

- 添加微信code换取openid逻辑
- 实现JWT token生成
- 添加用户注册/查询接口

Closes #123
```

---

## 4. 开发阶段详细计划

### Week 1: 基础设施搭建 (Day 1-7)

**目标**: 搭建后端基础架构，完成数据库设计和基础数据导入

#### Day 1-2: 项目初始化

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W1-T1 | NestJS项目初始化 | BE-001 | 后端 | 项目可运行，目录结构符合规范 |
| W1-T2 | 配置Prisma ORM | BE-002 | 后端 | 数据库连接成功，可执行迁移 |
| W1-T3 | 配置Redis连接 | BE-003 | 后端 | Redis连接池正常工作 |
| W1-T4 | 配置日志系统 | BE-008 | 后端 | 日志分级输出，支持文件滚动 |

**技术方案**:
```typescript
// 项目结构
backend/
├── src/
│   ├── common/          # 公共模块
│   │   ├── filters/     # 异常过滤器
│   │   ├── guards/      # 守卫
│   │   ├── interceptors/# 拦截器
│   │   └── decorators/  # 装饰器
│   ├── config/          # 配置
│   ├── modules/         # 业务模块
│   │   ├── auth/        # 认证
│   │   ├── users/       # 用户
│   │   ├── universities/# 院校
│   │   ├── majors/      # 专业
│   │   ├── camps/       # 夏令营
│   │   └── reminders/   # 提醒
│   ├── prisma/          # Prisma schema和迁移
│   └── main.ts
├── test/
└── package.json
```

#### Day 3-4: 数据库设计实现

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W1-T5 | 创建数据库表结构 | DB-001 | 后端 | 所有表创建成功，外键关系正确 |
| W1-T6 | 用户表实现 | DB-002 | 后端 | 包含openid、昵称、头像字段 |
| W1-T7 | 院校表实现 | DB-003 | 后端 | 包含地域、层次标签字段 |
| W1-T8 | 专业表实现 | DB-004 | 后端 | 包含学科门类字段 |
| W1-T9 | 夏令营表实现 | DB-005 | 后端 | 包含学院名称字段 |
| W1-T10 | 用户选择表实现 | DB-006 | 后端 | 关联用户-院校-专业 |
| W1-T11 | 提醒表实现 | DB-007 | 后端 | 包含提醒时间、状态字段 |

**Prisma Schema关键定义**:
```prisma
// 院校表（补充地域和层次标签）
model University {
  id          String   @id @default(uuid())
  name        String   @unique
  code        String?  // 院校代码
  region      String   // 地域：华北/华东/华南/华中/西南/西北/东北
  level       String   // 层次：985/211/双一流/普通
  logoUrl     String?
  website     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  camps       CampInfo[]
  selections  UserSelection[]
}

// 夏令营表（补充学院字段）
model CampInfo {
  id            String   @id @default(uuid())
  title         String
  universityId  String
  collegeName   String?  // 所属学院（新增）
  majorIds      String   // JSON数组存储相关专业ID
  description   String?  @db.Text
  requirements  String?  @db.Text
  schedule      String?  @db.Text
  deadline      DateTime
  sourceUrl     String
  attachmentUrl String?
  status        String   @default("active") // active/ended/cancelled
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  university    University @relation(fields: [universityId], references: [id])
  reminders     Reminder[]
}
```

#### Day 5-6: 基础数据导入

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W1-T12 | 院校基础数据导入 | DATA-001 | 后端 | 导入366所具有保研资格院校 |
| W1-T13 | 专业基础数据导入 | DATA-002 | 后端 | 导入主要学科专业数据 |
| W1-T14 | 地域映射数据初始化 | DATA-003 | 后端 | 所有院校地域字段正确 |
| W1-T15 | 层次标签数据初始化 | DATA-004 | 后端 | 985/211/双一流标签正确 |

**数据来源**:
- 院校列表：教育部公布的具有保研资格高校名单
- 地域划分：按7大地理区域标准
- 层次标签：教育部官方评估结果

#### Day 7: 中间件和工具

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W1-T16 | 统一响应格式中间件 | BE-004 | 后端 | 所有接口返回统一格式 |
| W1-T17 | JWT认证中间件 | BE-005 | 后端 | Token生成/验证正常工作 |
| W1-T18 | 全局异常处理 | BE-004 | 后端 | 异常统一捕获，返回友好提示 |

**统一响应格式**:
```typescript
{
  "code": 200,           // HTTP状态码
  "message": "success",  // 提示信息
  "data": { ... },       // 业务数据
  "timestamp": 1700000000
}
```

**Week 1 交付物**:
- [ ] NestJS后端项目框架
- [ ] 完整的数据库表结构
- [ ] 基础院校/专业数据（含地域和层次标签）
- [ ] JWT认证中间件
- [ ] 统一响应格式和异常处理

---

### Week 2: 核心API开发 (Day 8-14)

**目标**: 实现所有核心业务API，完成用户认证流程

#### Day 8-9: 用户认证模块

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W2-T1 | 微信登录code换取openid | AUTH-001 | 后端 | 正确换取微信用户信息 |
| W2-T2 | 用户注册/登录API | AUTH-002 | 后端 | 返回JWT token和用户信息 |
| W2-T3 | 用户信息查询API | BE-009 | 后端 | 返回用户基本信息和选择 |
| W2-T4 | Token刷新机制 | AUTH-003 | 后端 | 支持token自动刷新 |

**API设计**:
```typescript
// POST /auth/login
{
  "code": "微信登录code"
}

// Response
{
  "code": 200,
  "data": {
    "token": "jwt_token",
    "refreshToken": "refresh_token",
    "user": {
      "id": "user_id",
      "openid": "openid",
      "nickname": "用户昵称",
      "avatarUrl": "头像URL"
    }
  }
}
```

#### Day 10-11: 院校专业模块

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W2-T5 | 院校列表API（支持筛选） | BE-010 | 后端 | 支持地域/层次/首字母筛选 |
| W2-T6 | 院校详情API | BE-010 | 后端 | 返回院校完整信息 |
| W2-T7 | 专业列表API | BE-011 | 后端 | 支持学科门类筛选 |
| W2-T8 | 用户选择保存API | BE-013 | 后端 | 保存用户院校/专业选择 |

**筛选参数**:
```typescript
// GET /universities?region=华东&level=985&letter=T
{
  "list": [...],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

#### Day 12-13: 夏令营模块

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W2-T9 | 夏令营列表API | BE-012 | 后端 | 支持分页和筛选 |
| W2-T10 | 夏令营详情API | BE-012 | 后端 | 返回完整夏令营信息 |
| W2-T11 | 按用户选择筛选 | CAMP-003 | 后端 | 根据用户选择过滤夏令营 |
| W2-T12 | 即将截止API | CAMP-004 | 后端 | 返回7天内截止的夏令营 |

**筛选逻辑**:
```typescript
// 根据用户选择筛选
// GET /camps?filterBySelection=true
// 后端根据用户已选院校和专业自动过滤
```

#### Day 14: API测试和文档

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W2-T13 | Swagger文档配置 | BE-007 | 后端 | 所有API自动生成文档 |
| W2-T14 | API单元测试 | - | 后端 | 核心接口覆盖率>80% |
| W2-T15 | 接口限流配置 | BE-006 | 后端 | 配置合理的限流策略 |

**Week 2 交付物**:
- [ ] 完整的用户认证流程
- [ ] 院校/专业查询API（支持多维度筛选）
- [ ] 夏令营列表/详情API
- [ ] 用户选择保存功能
- [ ] Swagger API文档
- [ ] 单元测试覆盖

---

### Week 3: 爬虫服务开发 (Day 15-21)

**目标**: 实现夏令营信息自动爬取和AI提取

#### Day 15-16: 爬虫框架搭建

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W3-T1 | Scrapy项目初始化 | CRAWLER-001 | 爬虫 | 项目可运行，目录结构规范 |
| W3-T2 | 数据库连接配置 | CRAWLER-001 | 爬虫 | 可读写MySQL数据库 |
| W3-T3 | DeepSeek API集成 | CRAWLER-003 | 爬虫 | 可调用API提取结构化信息 |

**项目结构**:
```
crawler/
├── scrapy.cfg
├── crawler/
│   ├── __init__.py
│   ├── items.py          # 数据模型
│   ├── middlewares.py    # 中间件
│   ├── pipelines.py      # 数据处理管道
│   ├── settings.py       # 配置
│   └── spiders/          # 爬虫
│       ├── tsinghua.py   # 清华爬虫
│       ├── peking.py     # 北大爬虫
│       └── ...
├── utils/
│   └── ai_extractor.py   # AI提取工具
└── requirements.txt
```

#### Day 17-18: 核心院校爬虫

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W3-T4 | 清华大学爬虫 | CRAWLER-002 | 爬虫 | 可提取夏令营标题/时间/要求 |
| W3-T5 | 北京大学爬虫 | CRAWLER-002 | 爬虫 | 可提取夏令营标题/时间/要求 |
| W3-T6 | 通用爬虫模板 | CRAWLER-002 | 爬虫 | 可复制到其他院校 |

**AI提取Prompt模板**:
```python
CAMP_EXTRACT_PROMPT = """
从以下夏令营通知文本中提取结构化信息：

文本内容：
{content}

请提取以下字段（JSON格式）：
{
  "title": "夏令营标题",
  "collegeName": "举办学院名称",
  "majorNames": ["涉及专业名称列表"],
  "deadline": "报名截止日期（YYYY-MM-DD格式）",
  "requirements": "申请条件",
  "schedule": "活动安排",
  "description": "夏令营简介",
  "contact": "联系方式"
}

注意：
1. 如果某字段在文本中未提及，返回null
2. 日期必须标准化为YYYY-MM-DD格式
3. collegeName必须准确提取学院全称
"""
```

#### Day 19-20: 数据处理和存储

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W3-T7 | 数据清洗管道 | CRAWLER-002 | 爬虫 | 去重、格式化、校验 |
| W3-T8 | 学院信息提取 | CRAWLER-005 | 爬虫 | 正确提取学院名称 |
| W3-T9 | 专业匹配逻辑 | CRAWLER-002 | 爬虫 | 将文本专业匹配到标准专业ID |
| W3-T10 | 数据入库管道 | CRAWLER-002 | 爬虫 | 自动写入camp_infos表 |

#### Day 21: 定时任务和监控

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W3-T11 | APScheduler定时任务 | CRAWLER-004 | 爬虫 | 每日自动执行爬取 |
| W3-T12 | 爬虫监控日志 | - | 爬虫 | 记录爬取成功/失败数量 |
| W3-T13 | 异常重试机制 | - | 爬虫 | 失败自动重试3次 |

**定时任务配置**:
```python
# 每日凌晨2点执行
scheduler.add_job(
    run_spiders,
    'cron',
    hour=2,
    minute=0,
    id='daily_crawl'
)
```

**Week 3 交付物**:
- [ ] Scrapy爬虫框架
- [ ] Top 10院校爬虫实现
- [ ] AI信息提取集成
- [ ] 定时爬取任务
- [ ] 数据清洗和入库管道

---

### Week 4: 提醒功能开发 (Day 22-28)

**目标**: 实现微信订阅消息提醒和定时推送

#### Day 22-23: 提醒API开发

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W4-T1 | 提醒创建API | BE-014 | 后端 | 创建提醒记录 |
| W4-T2 | 提醒列表API | BE-014 | 后端 | 支持状态筛选 |
| W4-T3 | 提醒删除API | BE-014 | 后端 | 软删除提醒 |
| W4-T4 | 微信订阅授权接口 | BE-015 | 后端 | 获取用户订阅授权 |

**提醒创建逻辑**:
```typescript
// POST /reminders
{
  "campId": "夏令营ID",
  "remindTime": "2024-03-15T09:00:00Z", // 提醒时间
  "remindType": "wechat" // wechat/app/all
}

// 后端逻辑：
// 1. 校验夏令营存在且未截止
// 2. 校验提醒时间在截止时间之前
// 3. 如果type包含wechat，检查用户是否已授权订阅消息
// 4. 创建提醒记录，状态为pending
```

#### Day 24-25: 微信订阅消息

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W4-T5 | 微信模板消息配置 | REM-001 | 后端 | 配置夏令营提醒模板 |
| W4-T6 | 订阅授权前端对接 | REM-004 | 前端 | 用户可授权订阅消息 |
| W4-T7 | 模板消息发送服务 | REM-006 | 后端 | 可发送微信模板消息 |

**微信模板消息格式**:
```json
{
  "touser": "用户openid",
  "template_id": "模板ID",
  "page": "/packageCamp/pages/camp-detail/index?id=xxx",
  "data": {
    "thing1": { "value": "清华大学计算机系夏令营" },
    "time2": { "value": "2024-03-31" },
    "thing3": { "value": "报名即将截止，请尽快完成报名" }
  }
}
```

#### Day 26-27: 定时推送服务

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W4-T8 | 定时任务调度器 | REM-006 | 后端 | 每分钟检查待发送提醒 |
| W4-T9 | 提醒推送服务 | REM-006 | 后端 | 定时发送微信消息 |
| W4-T10 | 推送状态更新 | REM-006 | 后端 | 更新提醒状态为已发送 |
| W4-T11 | 失败重试机制 | REM-006 | 后端 | 失败自动重试3次 |

**定时推送逻辑**:
```typescript
// 每分钟执行
@Cron(CronExpression.EVERY_MINUTE)
async sendPendingReminders() {
  const now = new Date();
  const reminders = await this.prisma.reminder.findMany({
    where: {
      status: 'pending',
      remindTime: { lte: now }
    }
  });
  
  for (const reminder of reminders) {
    try {
      await this.wechatService.sendTemplateMessage(reminder);
      await this.updateReminderStatus(reminder.id, 'sent');
    } catch (error) {
      await this.handleSendFailure(reminder, error);
    }
  }
}
```

#### Day 28: 提醒功能测试

| 任务ID | 任务名称 | 功能点 | 负责人 | 验收标准 |
|--------|----------|--------|--------|----------|
| W4-T12 | 提醒创建测试 | REM-002 | 前端 | 可从夏令营详情创建提醒 |
| W4-T13 | 提醒列表测试 | REM-003 | 前端 | 我的提醒页正常展示 |
| W4-T14 | 推送测试 | REM-006 | 后端 | 实际收到微信提醒消息 |

**Week 4 交付物**:
- [ ] 提醒创建/查询/删除API
- [ ] 微信订阅消息授权
- [ ] 定时推送服务
- [ ] 前端提醒功能对接

---

## 5. 前端API对接计划

### 5.1 对接顺序

| 阶段 | 对接模块 | 预计时间 | 依赖 |
|------|----------|----------|------|
| Phase 1 | 用户登录 | Week 2 Day 9 | W2-T2完成 |
| Phase 2 | 院校/专业选择 | Week 2 Day 11 | W2-T5~T8完成 |
| Phase 3 | 夏令营列表 | Week 2 Day 13 | W2-T9~T12完成 |
| Phase 4 | 提醒功能 | Week 4 Day 28 | W4-T1~T14完成 |

### 5.2 前端改造清单

| 文件路径 | 改造内容 | 优先级 |
|----------|----------|--------|
| `services/auth.js` | 对接真实登录API | P0 |
| `services/university.js` | 对接院校列表API | P0 |
| `services/camp.js` | 对接夏令营列表/详情API | P0 |
| `services/reminder.js` | 对接提醒创建/列表API | P0 |
| `pages/index/index.js` | 移除mock数据，使用真实API | P0 |
| `pages/my/my.js` | 对接用户信息API | P0 |
| `store/user.js` | 更新登录状态管理 | P0 |
| `store/camp.js` | 更新夏令营数据获取 | P0 |

---

## 6. 代码审查和质量标准

### 6.1 代码审查流程

```
开发完成 → 自测 → 提交PR → Code Review → 修复问题 → 合并
```

**审查 checklist**:
- [ ] 代码符合项目规范
- [ ] 有必要的注释
- [ ] 无console.log调试代码
- [ ] 错误处理完善
- [ ] 单元测试通过
- [ ] 无敏感信息泄露

### 6.2 质量标准

| 指标 | 目标值 | 检查方式 |
|------|--------|----------|
| 单元测试覆盖率 | >80% | Jest coverage report |
| API响应时间 | <200ms (P95) | 日志统计 |
| 数据库查询时间 | <100ms | Prisma日志 |
| 代码重复率 | <5% | SonarQube |
| 安全漏洞 | 0高危 | npm audit |

### 6.3 性能要求

- **接口响应**: 95%请求<200ms
- **数据库查询**: 单表查询<50ms，关联查询<100ms
- **并发支持**: 支持100并发用户
- **缓存命中**: Redis缓存命中率>80%

---

## 7. 风险管理

### 7.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 微信API限制 | 中 | 高 | 提前申请接口权限，准备降级方案 |
| 爬虫被封禁 | 高 | 中 | 配置代理池，控制请求频率 |
| AI提取不准确 | 中 | 中 | 人工校验+反馈优化 |
| 数据库性能瓶颈 | 低 | 高 | 提前设计索引，预留分库分表方案 |

### 7.2 进度风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 开发延期 | 中 | 高 | 每周review，及时调整计划 |
| 需求变更 | 中 | 中 | 严格执行变更流程，评估影响 |
| 人员变动 | 低 | 高 | 文档完善，知识共享 |

---

## 8. 沟通机制

### 8.1 日常沟通

- **每日站会**: 9:30，15分钟，同步进度和阻塞
- **即时通讯**: 微信群/飞书，技术问题实时讨论
- **文档协作**: 飞书文档，需求变更实时同步

### 8.2 定期会议

| 会议 | 频率 | 时间 | 参与人 | 内容 |
|------|------|------|--------|------|
| 周会 | 每周五 | 16:00 | 全员 | 本周总结，下周计划 |
| 技术评审 | 每阶段结束 | 按需 | 技术团队 | 架构评审，代码review |
| 进度汇报 | 每周一 | 10:00 | PM+技术负责人 | 进度同步，风险预警 |

### 8.3 问题升级

```
技术问题 → 技术负责人 → 架构师
进度问题 → PM → 项目负责人
资源问题 → 项目负责人 → 管理层
```

---

## 9. 交付清单

### 9.1 Week 1 交付物

- [ ] NestJS后端项目（可运行）
- [ ] 完整的数据库迁移文件
- [ ] 基础数据SQL文件（院校/专业）
- [ ] 接口文档（Swagger）
- [ ] 部署文档

### 9.2 Week 2 交付物

- [ ] 用户认证API（登录/注册/刷新）
- [ ] 院校/专业查询API（支持筛选）
- [ ] 夏令营列表/详情API
- [ ] 用户选择保存API
- [ ] 单元测试报告

### 9.3 Week 3 交付物

- [ ] Scrapy爬虫项目
- [ ] Top 10院校爬虫
- [ ] AI提取服务
- [ ] 定时任务配置
- [ ] 爬虫监控面板

### 9.4 Week 4 交付物

- [ ] 提醒创建/查询/删除API
- [ ] 微信订阅消息服务
- [ ] 定时推送服务
- [ ] 前端API对接完成
- [ ] 集成测试报告

### 9.5 MVP最终交付物

- [ ] 完整后端服务代码
- [ ] 爬虫服务代码
- [ ] 前端代码（API对接后）
- [ ] 数据库迁移脚本
- [ ] API接口文档
- [ ] 部署运维文档
- [ ] 测试报告
- [ ] 用户操作手册

---

## 10. 附录

### 10.1 开发环境配置

**后端开发环境**:
```bash
# Node.js 20 LTS
nvm install 20
nvm use 20

# MySQL 8.0
docker run -d --name mysql8 \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=baoyan \
  -p 3306:3306 mysql:8.0

# Redis 7.0
docker run -d --name redis7 \
  -p 6379:6379 redis:7.0
```

**爬虫开发环境**:
```bash
# Python 3.11
pyenv install 3.11.0
pyenv local 3.11.0

# 依赖安装
pip install -r requirements.txt
```

### 10.2 测试环境配置

```bash
# 测试数据库
docker run -d --name mysql8-test \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=baoyan_test \
  -p 3307:3306 mysql:8.0

# 运行测试
npm run test:e2e
```

### 10.3 生产环境配置

| 服务 | 配置 | 数量 |
|------|------|------|
| 后端服务 | 2核4G | 2台 |
| MySQL | 4核8G | 1主1从 |
| Redis | 2核4G | 1主 |
| 爬虫 | 2核4G | 1台 |

---

**文档结束**
