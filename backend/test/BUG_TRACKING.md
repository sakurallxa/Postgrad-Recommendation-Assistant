# 缺陷跟踪报告

**项目名称**: 保研信息助手  
**报告日期**: 2026-02-25  
**跟踪状态**: 开放中  

---

## 缺陷汇总

| 缺陷ID | 缺陷描述 | 严重程度 | 优先级 | 状态 | 指派给 | 预计修复时间 |
|--------|----------|----------|--------|------|--------|--------------|
| BUG-001 | 提醒模块大量数据处理性能问题 | 一般 | P1 | 待修复 | 后端团队 | 3天 |
| BUG-002 | 认证模块缺少请求参数校验DTO | 轻微 | P2 | 待修复 | 后端团队 | 1天 |
| BUG-003 | 夏令营模块缺少详情接口 | 一般 | P1 | 待修复 | 后端团队 | 2天 |
| BUG-004 | 院校模块缺少详情接口 | 一般 | P1 | 待修复 | 后端团队 | 2天 |

---

## 详细缺陷描述

### BUG-001: 提醒模块大量数据处理性能问题

#### 基本信息
- **缺陷ID**: BUG-001
- **所属模块**: 提醒模块 (Reminder)
- **所属服务**: ReminderService
- **发现时间**: 2026-02-25
- **发现人**: 自动化测试系统
- **严重程度**: 一般
- **优先级**: P1
- **状态**: 待修复

#### 缺陷描述
当提醒数据超过1000条时，GET /api/v1/reminders接口的查询响应时间超过1秒，不符合性能要求（<500ms）。这会影响用户体验，特别是在用户拥有大量提醒时。

#### 复现步骤
1. 准备测试环境，确保数据库可写入
2. 创建1000条提醒数据：
   ```typescript
   const reminders = Array(1000).fill(null).map((_, i) => ({
     userId: testUser.id,
     campId: testCamp.id,
     remindTime: new Date(`2026-06-${(i % 30) + 1}`),
     status: 'pending',
   }));
   await prisma.reminder.createMany({ data: reminders });
   ```
3. 调用GET /api/v1/reminders接口
4. 记录响应时间

#### 预期结果
- 响应时间 < 500ms
- 返回所有提醒数据
- 按createdAt降序排列

#### 实际结果
- 响应时间约 1250ms
- 返回数据正确
- 性能不达标

#### 环境信息
- **操作系统**: macOS
- **数据库**: SQLite 3
- **Node.js版本**: v18.x
- **测试框架**: Jest + Supertest

#### 根因分析
1. 缺少数据库索引，导致全表扫描
2. 查询未限制返回数量，一次性加载大量数据
3. 未使用缓存机制

#### 建议修复方案

**方案1: 添加数据库索引（推荐）**
```prisma
// schema.prisma
model Reminder {
  // ... 其他字段
  userId    String
  createdAt DateTime @default(now())
  
  @@index([userId, createdAt]) // 添加复合索引
}
```

**方案2: 实现分页查询**
```typescript
// reminder.service.ts
async findAll(userId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    this.prisma.reminder.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.reminder.count({ where: { userId } }),
  ]);
  
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
```

**方案3: 使用Redis缓存**
```typescript
// 缓存用户提醒列表
const cacheKey = `reminders:${userId}`;
let reminders = await redis.get(cacheKey);

if (!reminders) {
  reminders = await this.prisma.reminder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  await redis.setex(cacheKey, 300, JSON.stringify(reminders)); // 缓存5分钟
}
```

#### 修复验证
- [ ] 添加索引后响应时间 < 200ms
- [ ] 分页查询正常工作
- [ ] 缓存机制有效
- [ ] 单元测试通过
- [ ] 集成测试通过

---

### BUG-002: 认证模块缺少请求参数校验DTO

#### 基本信息
- **缺陷ID**: BUG-002
- **所属模块**: 认证模块 (Auth)
- **所属文件**: auth.dto.ts
- **发现时间**: 2026-02-25
- **发现人**: 自动化测试系统
- **严重程度**: 轻微
- **优先级**: P2
- **状态**: 待修复

#### 缺陷描述
WxLoginDto缺少对code字段的@IsNotEmpty()和@IsString()验证装饰器，导致当请求体为空对象或code字段缺失时，错误信息不够友好，无法明确告知用户缺少必填参数。

#### 复现步骤
1. 发送POST请求到/api/v1/auth/wx-login
2. 请求体为空对象：`{}`
3. 或请求体缺少code字段：`{ "otherField": "value" }`
4. 观察错误响应

#### 预期结果
```json
{
  "statusCode": 400,
  "message": ["code should not be empty", "code must be a string"],
  "error": "Bad Request"
}
```

#### 实际结果
```json
{
  "statusCode": 400,
  "message": "Bad Request",
  "error": "Bad Request"
}
```

#### 环境信息
- 所有环境均存在此问题

#### 建议修复方案
```typescript
// auth.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class WxLoginDto {
  @IsNotEmpty({ message: '微信登录凭证不能为空' })
  @IsString({ message: '微信登录凭证必须是字符串' })
  code: string;
}
```

#### 修复验证
- [ ] 空code返回明确的错误信息
- [ ] null code返回明确的错误信息
- [ ] 非字符串code返回明确的错误信息
- [ ] 有效的code正常处理

---

### BUG-003: 夏令营模块缺少详情接口

#### 基本信息
- **缺陷ID**: BUG-003
- **所属模块**: 夏令营模块 (Camp)
- **所属文件**: camp.controller.ts
- **发现时间**: 2026-02-25
- **发现人**: 自动化测试系统
- **严重程度**: 一般
- **优先级**: P1
- **状态**: 待修复

#### 缺陷描述
根据功能设计文档，应该有GET /api/v1/camps/:id接口用于获取单个夏令营的详细信息，但当前实现中缺少该接口。这导致前端无法查看夏令营详情。

#### 复现步骤
1. 启动应用程序
2. 发送GET请求到/api/v1/camps/{validId}
3. 观察响应

#### 预期结果
- HTTP状态码: 200
- 返回夏令营详细信息

#### 实际结果
- HTTP状态码: 404
- 返回Not Found错误

#### 建议修复方案
```typescript
// camp.controller.ts
@Get(':id')
async findOne(@Param('id') id: string) {
  const camp = await this.campService.findOne(id);
  if (!camp) {
    throw new NotFoundException('夏令营不存在');
  }
  return camp;
}
```

```typescript
// camp.service.ts
async findOne(id: string) {
  return this.prisma.campInfo.findUnique({
    where: { id },
    include: {
      university: true,
      major: true,
    },
  });
}
```

#### 修复验证
- [ ] 有效ID返回夏令营详情
- [ ] 无效ID返回404错误
- [ ] 包含关联的university和major信息
- [ ] 单元测试通过
- [ ] 集成测试通过

---

### BUG-004: 院校模块缺少详情接口

#### 基本信息
- **缺陷ID**: BUG-004
- **所属模块**: 院校模块 (University)
- **所属文件**: university.controller.ts
- **发现时间**: 2026-02-25
- **发现人**: 自动化测试系统
- **严重程度**: 一般
- **优先级**: P1
- **状态**: 待修复

#### 缺陷描述
根据功能设计文档，应该有GET /api/v1/universities/:id接口用于获取单个院校的详细信息，但当前实现中缺少该接口。这导致前端无法查看院校详情。

#### 复现步骤
1. 启动应用程序
2. 发送GET请求到/api/v1/universities/{validId}
3. 观察响应

#### 预期结果
- HTTP状态码: 200
- 返回院校详细信息

#### 实际结果
- HTTP状态码: 404
- 返回Not Found错误

#### 建议修复方案
```typescript
// university.controller.ts
@Get(':id')
async findOne(@Param('id') id: string) {
  const university = await this.universityService.findOne(id);
  if (!university) {
    throw new NotFoundException('院校不存在');
  }
  return university;
}
```

```typescript
// university.service.ts
async findOne(id: string) {
  return this.prisma.university.findUnique({
    where: { id },
    include: {
      majors: true,
      campInfos: {
        where: { status: 'published' },
        orderBy: { publishDate: 'desc' },
      },
    },
  });
}
```

#### 修复验证
- [ ] 有效ID返回院校详情
- [ ] 无效ID返回404错误
- [ ] 包含关联的majors和campInfos信息
- [ ] 单元测试通过
- [ ] 集成测试通过

---

## 修复计划

### 第一阶段（本周内）
- [ ] BUG-003: 补充夏令营详情接口
- [ ] BUG-004: 补充院校详情接口

### 第二阶段（下周内）
- [ ] BUG-001: 优化提醒模块性能

### 第三阶段（后续迭代）
- [ ] BUG-002: 完善参数校验

---

## 修复状态更新记录

| 日期 | 缺陷ID | 操作 | 操作人 | 备注 |
|------|--------|------|--------|------|
| 2026-02-25 | BUG-001 | 创建 | 自动化测试系统 | 初始记录 |
| 2026-02-25 | BUG-002 | 创建 | 自动化测试系统 | 初始记录 |
| 2026-02-25 | BUG-003 | 创建 | 自动化测试系统 | 初始记录 |
| 2026-02-25 | BUG-004 | 创建 | 自动化测试系统 | 初始记录 |

---

## 附录

### 相关文档
- [测试报告](./TEST_REPORT.md)
- [测试用例](./test-cases.md)
- [API接口文档](../docs/API接口文档.md)
- [功能设计文档](../docs/功能设计文档.md)

### 联系方式
- **测试团队**: test-team@example.com
- **开发团队**: dev-team@example.com
- **项目经理**: pm@example.com
