# 保研信息助手 - 功能设计文档

**版本**: v1.0  
**日期**: 2026-02-25  
**分支**: feature/week1-core-modules

---

## 一、功能模块概览

### 1.1 Week 1 开发范围

| 模块 | 优先级 | 功能点 | 状态 |
|------|--------|--------|------|
| **认证模块** | P0 | 微信登录、Token刷新 | 待开发 |
| **院校模块** | P0 | 院校列表、筛选、详情 | 待开发 |
| **夏令营模块** | P0 | 夏令营列表、详情、筛选 | 待开发 |
| **用户模块** | P1 | 用户偏好设置 | 待开发 |

### 1.2 功能目标

1. **认证模块**: 实现微信小程序登录流程，支持JWT Token认证
2. **院校模块**: 提供366所保研院校的查询和筛选功能
3. **夏令营模块**: 提供夏令营信息的聚合展示和筛选功能
4. **用户模块**: 支持用户设置关注的院校和专业

---

## 二、数据模型设计

### 2.1 用户模型 (User)

```typescript
interface User {
  id: string;           // UUID主键
  openid: string;       // 微信openid
  createdAt: Date;      // 创建时间
  updatedAt: Date;      // 更新时间
}
```

### 2.2 院校模型 (University)

```typescript
interface University {
  id: string;           // UUID主键
  name: string;         // 院校名称
  logo?: string;        // 院校Logo
  region?: string;      // 地区
  level?: string;       // 985/211/双一流/普通
  website?: string;     // 官网
  priority: string;     // P0/P1/P2/P3
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.3 专业模型 (Major)

```typescript
interface Major {
  id: string;           // UUID主键
  name: string;         // 专业名称
  category?: string;    // 专业类别
  universityId: string; // 所属院校
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.4 夏令营模型 (CampInfo)

```typescript
interface CampInfo {
  id: string;           // UUID主键
  title: string;        // 标题
  sourceUrl: string;    // 原文链接
  universityId: string; // 所属院校
  majorId?: string;     // 所属专业
  publishDate?: Date;   // 发布日期
  deadline?: Date;      // 截止日期
  startDate?: Date;     // 开始日期
  endDate?: Date;       // 结束日期
  requirements?: string;// 申请要求(JSON)
  materials?: string;   // 所需材料(JSON)
  process?: string;     // 报名流程(JSON)
  status: string;       // draft/published/expired
  confidence: number;   // 置信度 0-1
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.5 用户选择模型 (UserSelection)

```typescript
interface UserSelection {
  id: string;           // UUID主键
  userId: string;       // 用户ID
  universityIds?: string; // 关注院校ID列表(JSON)
  majorIds?: string;    // 关注专业ID列表(JSON)
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 三、接口定义

### 3.1 认证接口

#### POST /api/v1/auth/wx-login
**功能**: 微信登录

**请求参数**:
```json
{
  "code": "string"  // 微信临时登录凭证
}
```

**响应数据**:
```json
{
  "user": {
    "id": "string",
    "openid": "string"
  },
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": "string"
}
```

**异常处理**:
- 400: 参数错误
- 401: 微信登录失败
- 500: 服务器错误

#### POST /api/v1/auth/refresh
**功能**: 刷新Token

**请求头**:
```
Authorization: Bearer {refreshToken}
```

**响应数据**:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": "string"
}
```

### 3.2 院校接口

#### GET /api/v1/universities
**功能**: 获取院校列表

**查询参数**:
- page: number (默认1)
- limit: number (默认20, 最大100)
- region?: string (地区筛选)
- level?: string (985/211/双一流/普通)
- keyword?: string (关键词搜索)

**响应数据**:
```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "logo": "string",
      "region": "string",
      "level": "string",
      "website": "string",
      "priority": "string"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 366,
    "totalPages": 19
  }
}
```

#### GET /api/v1/universities/:id
**功能**: 获取院校详情

**响应数据**:
```json
{
  "id": "string",
  "name": "string",
  "logo": "string",
  "region": "string",
  "level": "string",
  "website": "string",
  "priority": "string",
  "majors": [
    {
      "id": "string",
      "name": "string",
      "category": "string"
    }
  ],
  "campInfos": [
    {
      "id": "string",
      "title": "string",
      "deadline": "date"
    }
  ]
}
```

### 3.3 夏令营接口

#### GET /api/v1/camps
**功能**: 获取夏令营列表

**查询参数**:
- page: number (默认1)
- limit: number (默认20)
- universityId?: string (院校筛选)
- majorId?: string (专业筛选)
- status?: string (状态筛选)
- keyword?: string (关键词搜索)

**响应数据**:
```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "sourceUrl": "string",
      "university": {
        "id": "string",
        "name": "string"
      },
      "major": {
        "id": "string",
        "name": "string"
      },
      "publishDate": "date",
      "deadline": "date",
      "status": "string",
      "confidence": 0.95
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### GET /api/v1/camps/:id
**功能**: 获取夏令营详情

**响应数据**:
```json
{
  "id": "string",
  "title": "string",
  "sourceUrl": "string",
  "university": {
    "id": "string",
    "name": "string"
  },
  "major": {
    "id": "string",
    "name": "string"
  },
  "publishDate": "date",
  "deadline": "date",
  "startDate": "date",
  "endDate": "date",
  "requirements": {},
  "materials": {},
  "process": {},
  "status": "string",
  "confidence": 0.95
}
```

### 3.4 用户接口

#### GET /api/v1/user/selection
**功能**: 获取用户选择

**响应数据**:
```json
{
  "universityIds": ["string"],
  "majorIds": ["string"]
}
```

#### PUT /api/v1/user/selection
**功能**: 更新用户选择

**请求参数**:
```json
{
  "universityIds": ["string"],
  "majorIds": ["string"]
}
```

---

## 四、业务流程设计

### 4.1 微信登录流程

```
用户点击登录
    ↓
小程序调用 wx.login() 获取 code
    ↓
发送 code 到后端 /auth/wx-login
    ↓
后端调用微信接口获取 openid
    ↓
查找或创建用户
    ↓
生成 JWT Token
    ↓
返回 Token 和用户信息
```

### 4.2 院校查询流程

```
用户进入院校列表页
    ↓
前端发送 GET /universities 请求
    ↓
后端查询数据库
    ↓
支持分页、筛选、排序
    ↓
返回院校列表数据
```

### 4.3 夏令营查询流程

```
用户进入夏令营列表页
    ↓
前端发送 GET /camps 请求
    ↓
后端查询数据库
    ↓
支持按院校、专业、状态筛选
    ↓
返回夏令营列表数据
```

---

## 五、异常处理机制

### 5.1 异常分类

| 异常类型 | HTTP状态码 | 说明 |
|----------|-----------|------|
| 参数错误 | 400 | 请求参数不符合要求 |
| 认证失败 | 401 | Token无效或过期 |
| 权限不足 | 403 | 没有操作权限 |
| 资源不存在 | 404 | 请求的资源不存在 |
| 服务器错误 | 500 | 服务器内部错误 |

### 5.2 统一响应格式

**成功响应**:
```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

**错误响应**:
```json
{
  "code": 1001,
  "message": "参数错误",
  "details": "code不能为空"
}
```

### 5.3 错误码定义

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 微信登录失败 |
| 1003 | Token无效 |
| 1004 | Token过期 |
| 2001 | 院校不存在 |
| 2002 | 夏令营不存在 |
| 5000 | 服务器内部错误 |

---

## 六、编码规范

### 6.1 命名规范

- **文件命名**: 小写，使用连字符分隔 (e.g., `auth.controller.ts`)
- **类命名**: 大驼峰 (e.g., `AuthController`)
- **方法命名**: 小驼峰 (e.g., `wxLogin`)
- **常量命名**: 大写下划线 (e.g., `JWT_SECRET`)

### 6.2 代码结构

```
module/
├── dto/                    # 数据传输对象
│   ├── create-xxx.dto.ts
│   └── update-xxx.dto.ts
├── entities/               # 实体定义
│   └── xxx.entity.ts
├── xxx.controller.ts       # 控制器
├── xxx.service.ts          # 服务
├── xxx.module.ts           # 模块
└── xxx.spec.ts             # 测试文件
```

### 6.3 注释规范

- 所有公共方法必须添加JSDoc注释
- 复杂逻辑添加行内注释
- 接口定义添加字段说明

---

## 七、测试策略

### 7.1 单元测试

- 服务层方法覆盖率 >= 80%
- 控制器方法覆盖率 >= 70%
- 使用 Jest 测试框架

### 7.2 集成测试

- API端点测试
- 数据库操作测试
- 使用 supertest 进行HTTP测试

### 7.3 测试用例示例

```typescript
describe('AuthService', () => {
  it('should login with valid code', async () => {
    const result = await service.wxLogin('valid_code');
    expect(result.accessToken).toBeDefined();
    expect(result.user).toBeDefined();
  });

  it('should throw error with invalid code', async () => {
    await expect(service.wxLogin('')).rejects.toThrow();
  });
});
```

---

**文档结束**
