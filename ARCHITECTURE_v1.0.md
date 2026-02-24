# 保研信息助手小程序 - 架构设计文档

**版本**: v1.0  
**日期**: 2026-02-24  
**状态**: 待评审

---

## 1. 架构设计原则

### 1.1 核心设计原则

| 原则 | 说明 | 适用场景 |
|------|------|----------|
| **MVP优先** | 聚焦核心功能，快速迭代 | 所有功能模块设计 |
| **高可用** | 核心链路具备容错能力 | 爬虫服务、提醒服务 |
| **可扩展** | 模块化设计，支持水平扩展 | 后端服务、数据库 |
| **安全优先** | 数据安全与合规优先 | 用户数据、接口安全 |
| **成本可控** | 选择成熟方案，降低运维成本 | 技术选型、部署方案 |

### 1.2 架构约束

| 约束类型 | 约束内容 |
|----------|----------|
| 时间约束 | 必须在3月前完成MVP上线 |
| 资源约束 | 小团队开发，技术栈需统一 |
| 平台约束 | 微信小程序平台规范限制 |
| 合规约束 | 《个人信息保护法》、微信平台规范 |

---

## 2. 系统整体架构

### 2.1 架构全景图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              系统架构全景图                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           用户层 (User Layer)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │   │
│  │  │  微信小程序  │  │  微信订阅   │  │  微信授权   │                      │   │
│  │  │   (前端)    │  │   消息推送  │  │   登录      │                      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         接入层 (Gateway Layer)                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   Nginx     │  │   HTTPS     │  │   限流      │  │   日志      │    │   │
│  │  │   反向代理  │  │   证书      │  │   控制      │  │   记录      │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         服务层 (Service Layer)                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   API服务   │  │   爬虫服务  │  │   提醒服务  │  │   定时任务  │    │   │
│  │  │   (主业务)  │  │   (数据采集)│  │   (消息推送)│  │   (调度)    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         数据层 (Data Layer)                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   MySQL     │  │   Redis     │  │   OSS       │  │   日志存储  │    │   │
│  │  │   (主数据库)│  │   (缓存)    │  │   (文件存储)│  │   (日志)    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         外部依赖 (External Layer)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  院校官网   │  │  微信开放   │  │  AI大模型   │  │  监控告警   │    │   │
│  │  │  (数据源)   │  │  平台API    │  │  (信息提取) │  │  (运维)     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 技术架构分层

| 层级 | 技术组件 | 职责 |
|------|----------|------|
| 前端层 | 微信小程序原生、WXML + WXSS + TS | 用户交互界面、页面渲染与状态管理 |
| 接入层 | Nginx、HTTPS证书 | 反向代理、负载均衡、安全传输 |
| 服务层 | Node.js + NestJS、Python + FastAPI | 核心业务逻辑、爬虫服务(独立部署) |
| 数据层 | MySQL 8.0、Redis 7.0、阿里云OSS | 关系型数据存储、缓存、文件存储 |
| 中间件 | BullMQ、Winston | 任务队列、日志收集 |
| 外部服务 | 微信开放平台API、DeepSeek API | 登录、订阅消息、AI辅助信息提取 |

---

## 3. 核心模块划分

### 3.1 模块架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              核心模块架构                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         小程序前端模块 (Mini-Program)                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  首页模块   │  │  院校选择   │  │  夏令营详情 │  │  提醒管理   │    │   │
│  │  │  Home       │  │  Selector   │  │  CampDetail │  │  Reminder   │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │   │
│  │  │  公共组件   │  │  状态管理   │  │  工具函数   │                      │   │
│  │  │  Components │  │  Store      │  │  Utils      │                      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         后端服务模块 (Backend Service)                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  用户模块   │  │  院校模块   │  │  夏令营模块 │  │  提醒模块   │    │   │
│  │  │  UserModule │  │  UnivModule │  │  CampModule │  │  RemindMod  │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  认证模块   │  │  文件模块   │  │  日志模块   │  │  监控模块   │    │   │
│  │  │  AuthModule │  │  FileModule │  │  LogModule  │  │  MonitorMod │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         爬虫服务模块 (Crawler Service)                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  调度器     │  │  下载器     │  │  解析器     │  │  存储器     │    │   │
│  │  │  Scheduler  │  │  Downloader │  │  Parser     │  │  Storage    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │   │
│  │  │  监控告警   │  │  代理池     │  │  AI提取     │                      │   │
│  │  │  Monitor    │  │  ProxyPool  │  │  AIExtractor│                      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         提醒服务模块 (Reminder Service)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  任务队列   │  │  定时扫描   │  │  消息发送   │  │  状态更新   │    │   │
│  │  │  Queue      │  │  Scanner    │  │  Sender     │  │  Updater    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 模块职责说明

| 模块名称 | 所属层级 | 核心职责 | 关键接口 |
|----------|----------|----------|----------|
| **首页模块** | 小程序前端 | 展示用户关注的夏令营列表、倒计时 | - |
| **院校选择模块** | 小程序前端 | 院校/专业多选筛选、选择结果持久化 | - |
| **夏令营详情模块** | 小程序前端 | 结构化展示夏令营信息、原文链接跳转 | - |
| **提醒管理模块** | 小程序前端 | 设置/取消提醒、提醒列表查看 | - |
| **用户模块** | 后端服务 | 微信登录、用户信息管理 | `POST /auth/login`, `GET /user/profile` |
| **院校模块** | 后端服务 | 院校/专业数据查询 | `GET /universities`, `GET /majors` |
| **夏令营模块** | 后端服务 | 夏令营信息CRUD、筛选查询 | `GET /camps`, `GET /camps/:id` |
| **提醒模块** | 后端服务 | 提醒创建/取消/查询 | `POST /reminders`, `DELETE /reminders/:id` |
| **爬虫服务** | 独立服务 | 院校官网数据采集、信息结构化提取 | 内部调用 |
| **提醒服务** | 独立服务 | 定时扫描待发送提醒、调用微信API推送 | 内部调用 |

---

## 4. 模块间接口规范

### 4.1 API接口规范

#### 4.1.1 接口设计原则

| 原则 | 说明 |
|------|------|
| RESTful风格 | 资源导向的URL设计 |
| 统一响应格式 | `{ code, message, data }` |
| 版本控制 | URL中包含版本号 `/api/v1/` |
| 错误码规范 | 5位错误码，前2位为模块标识 |

#### 4.1.2 统一响应格式

```typescript
interface ApiResponse<T> {
  code: number;       // 0表示成功，非0表示错误
  message: string;    // 响应消息
  data: T;            // 响应数据
  timestamp: number;  // 响应时间戳
}

interface PageResponse<T> {
  list: T[];          // 数据列表
  total: number;      // 总数
  page: number;       // 当前页
  pageSize: number;   // 每页数量
}
```

#### 4.1.3 核心API接口定义

**认证模块**

```typescript
POST /api/v1/auth/login
Request: { code: string }  // 微信登录code
Response: { 
  token: string; 
  openid: string; 
  isNewUser: boolean;
}

POST /api/v1/auth/token
Request: { token: string }
Response: { valid: boolean; openid: string }
```

**院校模块**

```typescript
GET /api/v1/universities
Query: { category?: string; keyword?: string }
Response: PageResponse<University>

GET /api/v1/universities/:id/majors
Response: Major[]
```

**夏令营模块**

```typescript
GET /api/v1/camps
Query: { 
  universityIds?: string;  // 逗号分隔
  majorIds?: string;       // 逗号分隔
  status?: 'published' | 'expired';
  page?: number;
  pageSize?: number;
}
Response: PageResponse<CampInfo>

GET /api/v1/camps/:id
Response: CampInfo & {
  university: University;
  major: Major;
}
```

**提醒模块**

```typescript
POST /api/v1/reminders
Request: {
  campId: string;
  remindTime: string;  // ISO 8601格式
}
Response: Reminder

DELETE /api/v1/reminders/:id
Response: { success: boolean }

GET /api/v1/reminders
Query: { status?: 'pending' | 'sent' | 'expired' }
Response: PageResponse<Reminder & { camp: CampInfo }>

POST /api/v1/reminders/subscribe
Request: { templateId: string }
Response: { success: boolean; subscribed: boolean }
```

**用户选择模块**

```typescript
GET /api/v1/user/selections
Response: UserSelection

POST /api/v1/user/selections
Request: {
  universityIds: string[];
  majorIds: string[];
}
Response: UserSelection
```

### 4.2 内部服务接口

#### 4.2.1 爬虫服务接口

```typescript
interface CrawlerService {
  startCrawl(universityId: string): Promise<CrawlResult>;
  getCrawlStatus(taskId: string): Promise<CrawlStatus>;
  parseCampInfo(html: string, url: string): Promise<ParsedCampInfo>;
}

interface ParsedCampInfo {
  title: string;
  deadline?: Date;
  startDate?: Date;
  endDate?: Date;
  requirements: string[];
  materials: string[];
  process: string[];
  sourceUrl: string;
  confidence: number;  // 提取置信度 0-1
}
```

#### 4.2.2 提醒服务接口

```typescript
interface ReminderService {
  scanPendingReminders(): Promise<Reminder[]>;
  sendWechatMessage(openid: string, data: MessageData): Promise<SendResult>;
  updateReminderStatus(reminderId: string, status: 'sent' | 'failed'): Promise<void>;
}

interface MessageData {
  thing1: { value: string };  // 夏令营名称
  time2: { value: string };   // 截止时间
  thing3: { value: string };  // 提醒内容
}
```

---

## 5. 数据流转流程

### 5.1 核心业务流程

#### 5.1.1 用户登录流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  小程序  │     │  后端   │     │  微信   │     │  数据库  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │  wx.login()   │               │               │
     │──────────────>│               │               │
     │               │  code2Session │               │
     │               │──────────────>│               │
     │               │  openid       │               │
     │               │<──────────────│               │
     │               │               │               │
     │               │  查询用户     │               │
     │               │──────────────────────────────>│
     │               │  用户信息     │               │
     │               │<──────────────────────────────│
     │               │               │               │
     │               │  新用户则创建 │               │
     │               │──────────────────────────────>│
     │               │               │               │
     │  token + 用户信息              │               │
     │<──────────────│               │               │
     │               │               │               │
```

#### 5.1.2 夏令营信息获取流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  小程序  │     │  后端   │     │  Redis  │     │  MySQL  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ GET /camps    │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │  查询缓存     │               │
     │               │──────────────>│               │
     │               │  缓存命中?    │               │
     │               │<──────────────│               │
     │               │               │               │
     │               │  [未命中] 查询数据库          │
     │               │──────────────────────────────>│
     │               │  夏令营列表   │               │
     │               │<──────────────────────────────│
     │               │               │               │
     │               │  写入缓存     │               │
     │               │──────────────>│               │
     │               │               │               │
     │  夏令营列表   │               │               │
     │<──────────────│               │               │
     │               │               │               │
```

#### 5.1.3 提醒设置与推送流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  小程序  │     │  后端   │     │  MySQL  │     │  队列   │     │  微信   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │  设置提醒     │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │  创建提醒记录 │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │  请求订阅授权 │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │  用户授权     │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │  设置成功     │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │               │               │  [定时任务]   │               │
     │               │               │  扫描待发送   │               │
     │               │<──────────────────────────────│               │
     │               │               │               │               │
     │               │  发送订阅消息 │               │               │
     │               │───────────────────────────────────────────────>│
     │               │               │               │               │
     │               │  发送结果     │               │               │
     │               │<───────────────────────────────────────────────│
     │               │               │               │               │
     │               │  更新提醒状态 │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │  [用户收到微信推送]           │               │               │
     │               │               │               │               │
```

### 5.2 数据采集流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ 定时任务 │     │  调度器 │     │  下载器 │     │  解析器 │     │  存储器 │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │  触发爬取     │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │  获取院校列表 │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │  遍历院校URL  │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │               │  请求官网页面 │               │
     │               │               │──────────────>│               │
     │               │               │  HTML内容     │               │
     │               │               │<──────────────│               │
     │               │               │               │               │
     │               │               │  解析HTML     │               │
     │               │               │──────────────────────────────>│
     │               │               │               │               │
     │               │               │               │  [AI辅助提取] │
     │               │               │               │  结构化信息   │
     │               │               │<──────────────────────────────│
     │               │               │               │               │
     │               │               │  存储到数据库 │               │
     │               │               │───────────────────────────────────────>│
     │               │               │               │               │
     │               │  爬取结果     │               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │  完成/告警    │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
```

---

## 6. 技术选型

### 6.1 前端技术选型

#### 6.1.1 小程序框架选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **微信小程序原生** | 性能最优、API支持最全、调试方便 | 无法跨端、代码复用性差 | **✅ 推荐** |
| Taro | 跨端支持、React语法 | 性能略差、部分API兼容问题 | 不推荐 |
| uni-app | 跨端支持、Vue语法 | 性能略差、调试体验一般 | 不推荐 |

**选型结论**: 选择**微信小程序原生开发**

**选型依据**:
1. 本项目仅需支持微信小程序，无需跨端
2. 原生开发性能最优，包体积最小
3. 微信订阅消息等API支持最完整
4. 调试工具完善，开发效率高

#### 6.1.2 前端技术栈

| 技术组件 | 选型 | 版本 | 选型依据 |
|----------|------|------|----------|
| 开发语言 | TypeScript | 5.x | 类型安全，减少运行时错误 |
| 状态管理 | MobX | 6.x | 简单易用，适合小型项目 |
| UI组件库 | Vant Weapp | 1.x | 成熟稳定，组件丰富 |
| 请求库 | 封装wx.request | - | 统一错误处理、Token注入 |
| 构建工具 | 微信开发者工具 | - | 官方工具，无需额外配置 |

### 6.2 后端技术选型

#### 6.2.1 后端框架选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **Node.js + NestJS** | TypeScript全栈、模块化设计、依赖注入 | 学习曲线较陡 | **✅ 推荐** |
| Node.js + Express | 简单灵活、生态丰富 | 缺乏规范、大型项目维护困难 | 备选 |
| Python + FastAPI | 性能优秀、异步支持好 | 与前端技术栈不统一 | 不推荐 |
| Go + Gin | 性能最优 | 学习成本高、生态不如Node.js | 不推荐 |

**选型结论**: 选择**Node.js + NestJS**

**选型依据**:
1. TypeScript全栈，前后端类型共享
2. NestJS模块化设计，适合团队协作
3. 依赖注入、装饰器语法，代码结构清晰
4. 内置验证、序列化等功能，开发效率高

#### 6.2.2 后端技术栈

| 技术组件 | 选型 | 版本 | 选型依据 |
|----------|------|------|----------|
| 运行时 | Node.js | 20 LTS | 长期支持版本，稳定可靠 |
| 框架 | NestJS | 10.x | 企业级框架，模块化设计 |
| ORM | Prisma | 5.x | 类型安全、迁移管理方便 |
| 验证 | class-validator | 0.14 | 与NestJS深度集成 |
| 日志 | Winston | 3.x | 功能完善、支持多传输 |
| 定时任务 | @nestjs/schedule | 4.x | 与NestJS集成，Cron表达式支持 |

### 6.3 爬虫服务技术选型

#### 6.3.1 爬虫框架选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **Python + Scrapy** | 成熟稳定、功能完善、社区活跃 | 需要独立部署 | **✅ 推荐** |
| Node.js + Puppeteer | 与主服务技术栈统一 | 资源消耗大、反爬处理复杂 | 备选 |
| Python + BeautifulSoup | 简单易用 | 功能有限、无调度能力 | 不推荐 |

**选型结论**: 选择**Python + Scrapy**

**选型依据**:
1. Scrapy是业界最成熟的爬虫框架
2. 支持分布式爬取、断点续爬
3. 内置调度器、下载器、管道
4. 社区活跃，中间件丰富

#### 6.3.2 爬虫技术栈

| 技术组件 | 选型 | 版本 | 选型依据 |
|----------|------|------|----------|
| 运行时 | Python | 3.11 | 性能优秀，生态丰富 |
| 爬虫框架 | Scrapy | 2.x | 成熟稳定，功能完善 |
| HTML解析 | lxml + parsel | - | 性能优秀，XPath支持 |
| 异步HTTP | aiohttp | 3.x | 异步请求，提升效率 |
| AI提取 | DeepSeek API | - | 性价比高，中文理解能力强 |

### 6.4 数据库选型

#### 6.4.1 关系型数据库选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **MySQL** | 成熟稳定、生态完善、运维成本低 | 大数据量性能不如PostgreSQL | **✅ 推荐** |
| PostgreSQL | 功能强大、扩展性好 | 运维复杂度略高 | 不推荐 |
| SQLite | 轻量级、零配置 | 并发性能差、不适合生产环境 | 不推荐 |

**选型结论**: 选择**MySQL 8.0**

**选型依据**:
1. 数据量预期可控(院校~3000，夏令营~10000/年)
2. MySQL运维成熟，云服务支持完善
3. Prisma ORM对MySQL支持完善
4. 成本可控，阿里云RDS入门版即可满足需求

#### 6.4.2 缓存选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **Redis** | 性能优秀、数据结构丰富、支持持久化 | 单线程、内存成本高 | **✅ 推荐** |
| Memcached | 简单高效 | 功能单一、不支持持久化 | 不推荐 |

**选型结论**: 选择**Redis 7.0**

**选型依据**:
1. 支持多种数据结构(String、Hash、List、Set)
2. 支持分布式锁、消息队列
3. 可用于会话管理、热点数据缓存、提醒队列
4. 阿里云Redis入门版成本低

#### 6.4.3 文件存储选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **阿里云OSS** | 稳定可靠、CDN加速、成本可控 | 需要备案 | **✅ 推荐** |
| 腾讯云COS | 与微信生态集成好 | 价格略高 | 备选 |
| 本地存储 | 零成本 | 不可靠、无法CDN加速 | 不推荐 |

**选型结论**: 选择**阿里云OSS**

**选型依据**:
1. 院校logo等静态资源存储
2. CDN加速，提升加载速度
3. 成本可控，按量计费
4. 与阿里云ECS内网互通，传输免费

### 6.5 中间件选型

| 技术组件 | 选型 | 版本 | 选型依据 |
|----------|------|------|----------|
| 消息队列 | BullMQ | 5.x | 基于Redis，轻量级，与NestJS集成好 |
| 接口文档 | Swagger | 5.x | NestJS内置支持，自动生成 |
| 监控告警 | 阿里云ARMS | - | 与阿里云生态集成，开箱即用 |
| 日志收集 | 阿里云SLS | - | 日志查询分析，告警配置 |

### 6.6 部署环境选型

#### 6.6.1 云服务商选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **阿里云** | 产品线完善、文档丰富、价格透明 | 部分产品价格较高 | **✅ 推荐** |
| 腾讯云 | 与微信生态集成好 | 产品线不如阿里云完善 | 备选 |
| 华为云 | 政企客户首选 | 个人开发者生态一般 | 不推荐 |

**选型结论**: 选择**阿里云**

**选型依据**:
1. 产品线完善，一站式解决方案
2. 文档丰富，社区活跃
3. 学生优惠力度大
4. 与微信小程序无直接绑定关系，阿里云即可

#### 6.6.2 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      部署架构                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    阿里云 ECS                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Nginx     │  │  Node.js    │  │  Python     │     │   │
│  │  │   (前端代理)│  │  (API服务)  │  │  (爬虫服务) │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  │                                                         │   │
│  │  规格: 2核4G (可弹性扩容)                               │   │
│  │  系统: Ubuntu 22.04 LTS                                 │   │
│  │  进程管理: PM2 (Node.js) + Supervisor (Python)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    阿里云 RDS                            │   │
│  │  ┌─────────────┐                                        │   │
│  │  │   MySQL     │  规格: 1核2G (入门版)                  │   │
│  │  │   8.0       │  存储: 20GB SSD                        │   │
│  │  └─────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    阿里云 Redis                          │   │
│  │  ┌─────────────┐                                        │   │
│  │  │   Redis     │  规格: 1G (标准版)                     │   │
│  │  │   7.0       │                                        │   │
│  │  └─────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    阿里云 OSS                            │   │
│  │  ┌─────────────┐                                        │   │
│  │  │   对象存储   │  存储: 院校logo等静态资源              │   │
│  │  │   + CDN     │  CDN加速: 全国节点                     │   │
│  │  └─────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    阿里云 SLS                            │   │
│  │  ┌─────────────┐                                        │   │
│  │  │   日志服务   │  日志收集、查询、告警                  │   │
│  │  └─────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.7 开发工具链

| 工具类型 | 选型 | 选型依据 |
|----------|------|----------|
| 代码编辑器 | VS Code | 插件丰富，TypeScript支持好 |
| 版本控制 | Git + GitHub | 行业标准，协作方便 |
| API测试 | Postman | 功能完善，支持环境变量 |
| 数据库管理 | DBeaver | 开源免费，支持多种数据库 |
| Redis管理 | Another Redis Desktop Manager | 开源免费，界面友好 |
| 小程序开发 | 微信开发者工具 | 官方工具，调试方便 |
| 项目管理 | GitHub Projects | 与代码仓库集成，看板管理 |

---

## 7. 风险缓解策略在架构中的体现

### 7.1 致命风险缓解

#### 7.1.1 F-01 爬虫数据源失效

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 多数据源备份 | 院校官网(主) + 公众号文章(备) + 用户上报(兜底) |
| 模块化爬虫设计 | 每个院校独立爬虫模块，配置化启用/禁用 |
| 监控告警系统 | 爬虫状态监控，连续失败3次触发告警 |
| 人工录入兜底 | 后台管理系统支持人工录入/编辑夏令营信息 |

#### 7.1.2 S-01 用户隐私数据泄露

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 数据传输安全 | 全站HTTPS，HSTS强制 |
| 数据存储安全 | 仅收集openid，不收集手机号等敏感信息 |
| 接口安全 | JWT Token认证，接口签名验证，频率限制 |
| 日志安全 | 日志脱敏，openid记录为`openid***abc` |

#### 7.1.3 U-01 信息准确性导致用户损失

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 强制原文链接 | 详情页强制显示原文链接，点击跳转官网 |
| 免责声明 | 首页底部固定免责声明 |
| AI提取置信度 | AI提取结果带置信度，低于0.8标黄提示 |
| 用户纠错反馈 | 提供"信息纠错"入口，用户可提交修正建议 |

#### 7.1.4 R-01 微信小程序审核不通过

**架构层面的缓解措施**:

| 审核风险点 | 缓解措施 |
|------------|----------|
| 功能不完整 | MVP功能闭环，核心功能完整可用 |
| 隐私政策不合规 | 首次启动弹窗隐私政策，用户同意后方可使用 |
| 虚假宣传 | 避免绝对化用语，如"最全"、"第一"等 |
| 诱导分享 | 不设计分享得奖励等功能 |
| 类目不符 | 选择"教育 > 在线教育"类目 |

### 7.2 高危风险缓解

#### 7.2.1 F-02 信息结构化提取准确率低

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 多层提取策略 | HTML → 正则提取(基础) → AI辅助提取(增强) → 人工审核(兜底) |
| AI辅助提取 | 调用DeepSeek API，输入公告文本，输出JSON格式 |
| 置信度评估 | 正则匹配成功→高置信度，AI提取→中置信度，无法提取→低置信度需人工审核 |

#### 7.2.2 F-03 微信订阅消息配额限制

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 多次订阅引导 | 每次设置提醒时调用订阅接口，累积订阅次数 |
| 双重提醒保障 | 微信订阅消息(主渠道) + 小程序内提醒列表(备用渠道) |
| 优先级发送 | 截止当天→高优先级，截止前1天→中优先级，截止前3天→低优先级 |

#### 7.2.3 P-01 夏令营高峰期并发压力

**架构层面的缓解措施**:

| 缓解策略 | 技术实现 |
|----------|----------|
| 缓存策略 | 院校列表缓存1天，夏令营列表缓存1小时，夏令营详情缓存10分钟 |
| 接口限流 | 全局限流1000 req/min，单用户限流60 req/min |
| 弹性扩容 | 阿里云ECS支持弹性伸缩，高峰期自动扩容 |
| CDN加速 | 院校logo等静态资源通过CDN分发 |

#### 7.2.4 M-01 开发周期延误

**架构层面的缓解措施**:

| 风险场景 | 缓解措施 |
|----------|----------|
| 技术难点预估不足 | 提前进行技术预研，评估爬虫、AI提取等技术可行性 |
| 爬虫开发周期超预期 | 优先完成核心院校(985/211)爬虫，其他院校后续迭代 |
| 微信审核被拒 | 提前研究审核规范，预留1周审核时间 |
| 需求变更频繁 | 严格MVP范围，Not-To-Do List明确禁止功能 |

---

## 8. 数据库设计

### 8.1 ER图

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  University │         │    Major    │         │   CampInfo  │
├─────────────┤         ├─────────────┤         ├─────────────┤
│ id (PK)     │         │ id (PK)     │         │ id (PK)     │
│ name        │         │ name        │         │ universityId│──┐
│ logo        │         │ category    │         │ majorId     │──┼──┐
│ region      │         │ universityId│──┐      │ title       │  │  │
│ level       │         └─────────────┘  │      │ sourceUrl   │  │  │
│ createdAt   │                          │      │ deadline    │  │  │
│ updatedAt   │                          │      │ status      │  │  │
└─────────────┘                          │      └─────────────┘  │  │
      │                                   │             │        │  │
      └───────────────────────────────────┼─────────────┘        │  │
                                          │                      │  │
┌─────────────┐                           │                      │  │
│    User     │                           │                      │  │
├─────────────┤                           │                      │  │
│ id (PK)     │                           │                      │  │
│ openid      │                           │                      │  │
└─────────────┘                           │                      │  │
      │                                    │                      │  │
      ▼                                    │                      │  │
┌─────────────┐                           │                      │  │
│UserSelection│                           │                      │  │
├─────────────┤                           │                      │  │
│ userId (FK) │                           │                      │  │
│universityIds│───────────────────────────┘                      │  │
│ majorIds    │──────────────────────────────────────────────────┘  │
└─────────────┘                                                  │
      │                                                          │
      ▼                                                          │
┌─────────────┐                                                  │
│  Reminder   │                                                  │
├─────────────┤                                                  │
│ userId (FK) │                                                  │
│ campId (FK) │──────────────────────────────────────────────────┘
│ remindTime  │
│ status      │
└─────────────┘
```

### 8.2 表结构设计

#### 8.2.1 院校表 (universities)

```sql
CREATE TABLE universities (
  id VARCHAR(32) PRIMARY KEY COMMENT '院校ID',
  name VARCHAR(100) NOT NULL COMMENT '院校名称',
  logo VARCHAR(255) COMMENT '院校logo URL',
  region VARCHAR(20) COMMENT '所属地区',
  level ENUM('985', '211', '双一流', '普通') COMMENT '院校层次',
  website VARCHAR(255) COMMENT '官网地址',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_region (region),
  INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='院校表';
```

#### 8.2.2 专业表 (majors)

```sql
CREATE TABLE majors (
  id VARCHAR(32) PRIMARY KEY COMMENT '专业ID',
  name VARCHAR(100) NOT NULL COMMENT '专业名称',
  category VARCHAR(50) COMMENT '学科门类',
  universityId VARCHAR(32) NOT NULL COMMENT '所属院校ID',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_category (category),
  INDEX idx_university (universityId),
  FOREIGN KEY (universityId) REFERENCES universities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='专业表';
```

#### 8.2.3 夏令营信息表 (camp_infos)

```sql
CREATE TABLE camp_infos (
  id VARCHAR(32) PRIMARY KEY COMMENT '夏令营ID',
  universityId VARCHAR(32) NOT NULL COMMENT '院校ID',
  majorId VARCHAR(32) COMMENT '专业ID',
  title VARCHAR(255) NOT NULL COMMENT '夏令营标题',
  sourceUrl VARCHAR(500) NOT NULL COMMENT '原文链接',
  publishDate DATE COMMENT '发布日期',
  deadline DATE COMMENT '报名截止日期',
  startDate DATE COMMENT '夏令营开始日期',
  endDate DATE COMMENT '夏令营结束日期',
  requirements JSON COMMENT '申请要求(结构化)',
  materials JSON COMMENT '所需材料清单',
  process JSON COMMENT '报名流程步骤',
  status ENUM('draft', 'published', 'expired') DEFAULT 'published' COMMENT '状态',
  confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '信息置信度',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_university (universityId),
  INDEX idx_major (majorId),
  INDEX idx_deadline (deadline),
  INDEX idx_status (status),
  FOREIGN KEY (universityId) REFERENCES universities(id),
  FOREIGN KEY (majorId) REFERENCES majors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='夏令营信息表';
```

#### 8.2.4 用户表 (users)

```sql
CREATE TABLE users (
  id VARCHAR(32) PRIMARY KEY COMMENT '用户ID',
  openid VARCHAR(64) NOT NULL UNIQUE COMMENT '微信openid',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

#### 8.2.5 用户选择表 (user_selections)

```sql
CREATE TABLE user_selections (
  id VARCHAR(32) PRIMARY KEY COMMENT '选择ID',
  userId VARCHAR(32) NOT NULL UNIQUE COMMENT '用户ID',
  universityIds JSON COMMENT '关注的院校ID列表',
  majorIds JSON COMMENT '关注的专业ID列表',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (userId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户选择表';
```

#### 8.2.6 提醒表 (reminders)

```sql
CREATE TABLE reminders (
  id VARCHAR(32) PRIMARY KEY COMMENT '提醒ID',
  userId VARCHAR(32) NOT NULL COMMENT '用户ID',
  campId VARCHAR(32) NOT NULL COMMENT '夏令营ID',
  remindTime DATETIME NOT NULL COMMENT '提醒时间',
  status ENUM('pending', 'sent', 'failed', 'expired') DEFAULT 'pending' COMMENT '状态',
  templateId VARCHAR(50) COMMENT '订阅消息模板ID',
  sentAt DATETIME COMMENT '发送时间',
  errorMsg VARCHAR(255) COMMENT '错误信息',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (userId),
  INDEX idx_camp (campId),
  INDEX idx_status (status),
  INDEX idx_remind_time (remindTime),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (campId) REFERENCES camp_infos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提醒表';
```

---

## 9. 项目目录结构

### 9.1 小程序目录结构

```
miniprogram/
├── app.js                  # 小程序入口
├── app.json                # 小程序配置
├── app.wxss                # 全局样式
├── sitemap.json            # 站点地图
│
├── pages/                  # 页面
│   ├── index/              # 首页
│   ├── selector/           # 院校选择页
│   ├── camp-detail/        # 夏令营详情页
│   └── my-reminders/       # 我的提醒页
│
├── components/             # 公共组件
│   ├── camp-card/          # 夏令营卡片
│   ├── countdown/          # 倒计时组件
│   └── empty-state/        # 空状态组件
│
├── store/                  # 状态管理
│   ├── index.js            # Store入口
│   ├── user.js             # 用户状态
│   └── selection.js        # 选择状态
│
├── services/               # API服务
│   ├── request.js          # 请求封装
│   ├── auth.js             # 认证接口
│   ├── university.js       # 院校接口
│   ├── camp.js             # 夏令营接口
│   └── reminder.js         # 提醒接口
│
├── utils/                  # 工具函数
│   ├── util.js             # 通用工具
│   ├── date.js             # 日期处理
│   └── storage.js          # 本地存储
│
└── assets/                 # 静态资源
    ├── images/             # 图片
    └── icons/              # 图标
```

### 9.2 后端目录结构

```
backend/
├── src/
│   ├── main.ts                 # 入口文件
│   ├── app.module.ts           # 根模块
│   │
│   ├── modules/                # 业务模块
│   │   ├── auth/               # 认证模块
│   │   ├── user/               # 用户模块
│   │   ├── university/         # 院校模块
│   │   ├── camp/               # 夏令营模块
│   │   └── reminder/           # 提醒模块
│   │
│   ├── common/                 # 公共模块
│   │   ├── decorators/         # 装饰器
│   │   ├── filters/            # 异常过滤器
│   │   ├── guards/             # 守卫
│   │   ├── interceptors/       # 拦截器
│   │   └── pipes/              # 管道
│   │
│   ├── config/                 # 配置
│   │   ├── database.config.ts  # 数据库配置
│   │   ├── redis.config.ts     # Redis配置
│   │   └── wechat.config.ts    # 微信配置
│   │
│   └── prisma/                 # Prisma
│       └── schema.prisma       # 数据模型
│
├── test/                       # 测试
├── prisma/                     # Prisma迁移
└── package.json
```

### 9.3 爬虫服务目录结构

```
crawler/
├── scrapy.cfg                 # Scrapy配置
├── requirements.txt           # Python依赖
│
├── baoyan_crawler/            # 爬虫项目
│   ├── __init__.py
│   ├── settings.py            # 爬虫设置
│   ├── items.py               # 数据模型
│   ├── pipelines.py           # 数据管道
│   │
│   ├── spiders/               # 爬虫
│   │   ├── base.py            # 基础爬虫
│   │   ├── tsinghua.py        # 清华大学
│   │   ├── pku.py             # 北京大学
│   │   └── ...                # 其他院校
│   │
│   ├── middlewares/           # 中间件
│   │   ├── proxy.py           # 代理中间件
│   │   └── retry.py           # 重试中间件
│   │
│   └── utils/                 # 工具
│       ├── parser.py          # 解析工具
│       ├── ai_extractor.py    # AI提取
│       └── notify.py          # 告警通知
│
└── scripts/                   # 脚本
    ├── run.py                 # 运行脚本
    └── monitor.py             # 监控脚本
```

---

## 10. 技术选型总结

### 10.1 技术栈全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                      技术栈全景图                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  前端层                                                         │
│  ├── 微信小程序原生 (WXML + WXSS + TypeScript)                  │
│  ├── 状态管理: MobX 6.x                                         │
│  ├── UI组件库: Vant Weapp 1.x                                   │
│  └── 构建工具: 微信开发者工具                                    │
│                                                                 │
│  后端层                                                         │
│  ├── 运行时: Node.js 20 LTS                                     │
│  ├── 框架: NestJS 10.x                                          │
│  ├── ORM: Prisma 5.x                                            │
│  ├── 验证: class-validator                                      │
│  ├── 日志: Winston 3.x                                          │
│  └── 定时任务: @nestjs/schedule                                 │
│                                                                 │
│  爬虫层                                                         │
│  ├── 运行时: Python 3.11                                        │
│  ├── 框架: Scrapy 2.x                                           │
│  ├── HTML解析: lxml + parsel                                    │
│  ├── 异步HTTP: aiohttp 3.x                                      │
│  └── AI提取: DeepSeek API                                       │
│                                                                 │
│  数据层                                                         │
│  ├── 关系数据库: MySQL 8.0                                      │
│  ├── 缓存: Redis 7.0                                            │
│  ├── 文件存储: 阿里云OSS + CDN                                  │
│  └── 日志存储: 阿里云SLS                                        │
│                                                                 │
│  中间件                                                         │
│  ├── 消息队列: BullMQ 5.x                                       │
│  ├── 接口文档: Swagger 5.x                                      │
│  └── 监控告警: 阿里云ARMS                                       │
│                                                                 │
│  部署层                                                         │
│  ├── 云服务商: 阿里云                                           │
│  ├── 服务器: ECS 2核4G                                          │
│  ├── 数据库: RDS MySQL 1核2G                                    │
│  ├── 缓存: Redis 1G                                             │
│  └── 进程管理: PM2 + Supervisor                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 选型决策记录

| 决策点 | 选型 | 决策理由 |
|--------|------|----------|
| 小程序框架 | 微信原生 | 无跨端需求，性能最优，API支持最全 |
| 后端框架 | NestJS | TypeScript全栈，模块化设计，企业级规范 |
| 爬虫框架 | Scrapy | 业界最成熟，功能完善，社区活跃 |
| 数据库 | MySQL | 数据量可控，运维成熟，成本可控 |
| 缓存 | Redis | 数据结构丰富，支持队列和分布式锁 |
| 云服务商 | 阿里云 | 产品线完善，文档丰富，学生优惠 |
| AI提取 | DeepSeek | 性价比高，中文理解能力强 |

---

**文档结束**
