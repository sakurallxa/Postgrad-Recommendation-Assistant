# 保研信息助手小程序 - 前端架构设计文档

**版本**: v1.0  
**日期**: 2026-02-24  
**状态**: 待评审

---

## 1. 架构设计原则

### 1.1 核心设计原则

| 原则 | 说明 | 实践方式 |
|------|------|----------|
| **领域驱动** | 以业务领域为核心组织代码结构 | 按业务模块划分目录，实体与领域服务分离 |
| **组件化** | UI组件高度复用，逻辑与视图分离 | 基础组件、业务组件、页面组件分层 |
| **单向数据流** | 状态管理清晰可预测 | MobX响应式状态管理 |
| **渐进增强** | 核心功能优先，增强功能按需加载 | 分包加载、异步组件 |
| **性能优先** | 首屏加载快，交互响应快 | 代码分割、资源预加载、缓存策略 |

### 1.2 架构约束

| 约束类型 | 约束内容 | 应对策略 |
|----------|----------|----------|
| 平台约束 | 微信小程序包体积限制(主包2MB) | 分包加载、资源CDN、代码压缩 |
| API约束 | 微信小程序API限制 | 原生API封装、兼容性处理 |
| 性能约束 | 首屏加载时间<1.5s | 骨架屏、数据预加载、缓存优化 |
| 兼容约束 | 微信基础库版本兼容 | 最低版本7.0.0，渐进增强 |

---

## 2. 前端架构设计

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              前端分层架构                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           视图层 (View Layer)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   Pages     │  │   WXML      │  │   WXSS      │  │   WXS       │    │   │
│  │  │   页面      │  │   模板      │  │   样式      │  │   过滤器    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         组件层 (Component Layer)                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  基础组件   │  │  业务组件   │  │  布局组件   │  │  高阶组件   │    │   │
│  │  │  Base       │  │  Business   │  │  Layout     │  │  HOC        │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         状态层 (State Layer)                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  全局状态   │  │  模块状态   │  │  页面状态   │  │  本地缓存   │    │   │
│  │  │  Global     │  │  Module     │  │  Page       │  │  Storage    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         服务层 (Service Layer)                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  API服务    │  │  微信API    │  │  业务服务   │  │  工具服务   │    │   │
│  │  │  Http       │  │  WxAPI      │  │  Business   │  │  Utils      │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         基础层 (Foundation Layer)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  配置管理   │  │  错误处理   │  │  日志系统   │  │  监控埋点   │    │   │
│  │  │  Config     │  │  Error      │  │  Logger     │  │  Monitor    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 领域驱动模块划分

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           领域模块划分                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         核心域 (Core Domain)                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │   │
│  │  │  夏令营模块 │  │  提醒模块   │  │  选择模块   │                      │   │
│  │  │  Camp       │  │  Reminder   │  │  Selection  │                      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         支撑域 (Supporting Domain)                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │   │
│  │  │  院校模块   │  │  专业模块   │  │  用户模块   │                      │   │
│  │  │  University │  │  Major      │  │  User       │                      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         通用域 (Generic Domain)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  认证模块   │  │  文件模块   │  │  消息模块   │  │  搜索模块   │    │   │
│  │  │  Auth       │  │  File       │  │  Message    │  │  Search     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 模块职责定义

| 模块名称 | 领域类型 | 核心职责 | 包含内容 |
|----------|----------|----------|----------|
| **Camp** | 核心域 | 夏令营信息展示与管理 | 列表页、详情页、筛选逻辑 |
| **Reminder** | 核心域 | 提醒设置与推送管理 | 提醒创建、列表、状态管理 |
| **Selection** | 核心域 | 用户目标院校/专业选择 | 选择器、持久化、同步 |
| **University** | 支撑域 | 院校数据展示与筛选 | 院校列表、详情、筛选 |
| **Major** | 支撑域 | 专业数据展示与筛选 | 专业列表、分类、关联 |
| **User** | 支撑域 | 用户信息与偏好管理 | 登录、信息、设置 |
| **Auth** | 通用域 | 认证授权与Token管理 | 登录、Token刷新、权限 |
| **File** | 通用域 | 文件下载与管理 | 附件下载、预览、缓存 |
| **Message** | 通用域 | 消息通知与提示 | Toast、Modal、订阅消息 |
| **Search** | 通用域 | 搜索与筛选功能 | 搜索框、筛选器、历史 |

---

## 3. 技术选型

### 3.1 技术栈总览

| 技术领域 | 选型方案 | 版本 | 选型依据 |
|----------|----------|------|----------|
| **开发框架** | 微信小程序原生 | - | 无跨端需求，性能最优，API支持最全 |
| **开发语言** | TypeScript | 5.x | 类型安全，IDE支持好，团队熟悉 |
| **状态管理** | MobX | 6.x | 响应式、简单直观、学习成本低 |
| **样式方案** | WXSS + Less | - | 原生支持，变量、混入、嵌套 |
| **构建工具** | 微信开发者工具 | - | 官方工具，调试方便，热更新 |
| **代码规范** | ESLint + Prettier | - | 统一代码风格，自动格式化 |
| **版本控制** | Git + GitLab | - | 团队协作，分支管理，代码审查 |
| **接口文档** | Swagger | - | 与后端对接，自动生成 |

### 3.2 技术选型详细分析

#### 3.2.1 开发框架选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **微信小程序原生** | 性能最优、API支持最全、包体积最小 | 仅支持微信平台 | **✅ 推荐** |
| Taro | 跨端支持、React语法 | 包体积大、部分API兼容问题 | 不推荐 |
| uni-app | 跨端支持、Vue语法 | 包体积大、性能略差 | 不推荐 |
| mpvue | Vue语法 | 社区不活跃、维护停滞 | 不推荐 |

**选型结论**: 选择**微信小程序原生开发**

**选型依据**:
1. 本项目仅需支持微信小程序，无跨端需求
2. 原生开发性能最优，包体积最小
3. 微信订阅消息等API支持最完整
4. 调试工具完善，开发效率高

#### 3.2.2 状态管理选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **MobX** | 响应式、简单直观、学习成本低 | 需要装饰器支持 | **✅ 推荐** |
| Redux | 单向数据流、可预测性强 | 模板代码多、学习成本高 | 不推荐 |
| 自定义Store | 完全可控、无依赖 | 需要自己实现响应式 | 备选 |
| Westore | 小程序专用、性能优化 | 社区小、文档少 | 不推荐 |

**选型结论**: 选择**MobX**

**选型依据**:
1. 响应式编程，代码简洁直观
2. 学习成本低，团队快速上手
3. 与TypeScript配合良好
4. 社区活跃，文档完善

#### 3.2.3 UI组件库选型

| 候选方案 | 优势 | 劣势 | 评估结论 |
|----------|------|------|----------|
| **自定义组件** | 完全可控、包体积小 | 开发成本高 | **✅ 推荐** |
| WeUI | 微信官方、风格统一 | 组件少、定制性差 | 部分使用 |
| Vant Weapp | 组件丰富、文档完善 | 包体积大、样式定制难 | 不推荐 |
| ColorUI | 样式丰富、美观 | 组件少、维护停滞 | 不推荐 |

**选型结论**: 选择**自定义组件 + WeUI基础样式**

**选型依据**:
1. 项目UI设计简洁，组件需求可控
2. 自定义组件包体积最小
3. WeUI提供基础样式规范
4. 便于后续样式定制

---

## 4. 项目目录结构

### 4.1 完整目录结构

```
miniprogram/
├── app.js                      # 小程序入口
├── app.json                    # 小程序配置
├── app.wxss                    # 全局样式
├── sitemap.json                # 站点地图
│
├── pages/                      # 页面目录
│   ├── index/                  # 首页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── selector/               # 院校选择页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── camp-list/              # 夏令营列表页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── camp-detail/            # 夏令营详情页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── my-reminders/           # 我的提醒页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── my/                     # 个人中心页
│       ├── index.js
│       ├── index.json
│       ├── index.wxml
│       └── index.wxss
│
├── components/                 # 公共组件
│   ├── base/                   # 基础组件
│   │   ├── button/             # 按钮组件
│   │   ├── icon/               # 图标组件
│   │   ├── loading/            # 加载组件
│   │   ├── empty/              # 空状态组件
│   │   └── skeleton/           # 骨架屏组件
│   ├── business/               # 业务组件
│   │   ├── camp-card/          # 夏令营卡片
│   │   ├── university-item/    # 院校列表项
│   │   ├── major-item/         # 专业列表项
│   │   ├── countdown/          # 倒计时组件
│   │   ├── reminder-item/      # 提醒列表项
│   │   └── filter-bar/         # 筛选栏
│   └── layout/                 # 布局组件
│       ├── page-container/     # 页面容器
│       ├── scroll-view/        # 滚动容器
│       └── tab-bar/            # 底部导航
│
├── modules/                    # 业务模块(领域驱动)
│   ├── camp/                   # 夏令营模块
│   │   ├── store.js            # 状态管理
│   │   ├── service.js          # API服务
│   │   ├── types.js            # 类型定义
│   │   └── utils.js            # 工具函数
│   ├── reminder/               # 提醒模块
│   │   ├── store.js
│   │   ├── service.js
│   │   ├── types.js
│   │   └── utils.js
│   ├── selection/              # 选择模块
│   │   ├── store.js
│   │   ├── service.js
│   │   ├── types.js
│   │   └── utils.js
│   ├── university/             # 院校模块
│   │   ├── store.js
│   │   ├── service.js
│   │   ├── types.js
│   │   └── utils.js
│   ├── major/                  # 专业模块
│   │   ├── store.js
│   │   ├── service.js
│   │   ├── types.js
│   │   └── utils.js
│   └── user/                   # 用户模块
│       ├── store.js
│       ├── service.js
│       ├── types.js
│       └── utils.js
│
├── store/                      # 全局状态管理
│   ├── index.js                # Store入口
│   ├── global.js               # 全局状态
│   └── middleware.js           # 中间件
│
├── services/                   # API服务层
│   ├── http.js                 # HTTP请求封装
│   ├── auth.js                 # 认证接口
│   ├── university.js           # 院校接口
│   ├── major.js                # 专业接口
│   ├── camp.js                 # 夏令营接口
│   ├── reminder.js             # 提醒接口
│   └── user.js                 # 用户接口
│
├── utils/                      # 工具函数
│   ├── index.js                # 工具入口
│   ├── date.js                 # 日期处理
│   ├── storage.js              # 本地存储
│   ├── validator.js            # 数据校验
│   ├── formatter.js            # 数据格式化
│   ├── permission.js           # 权限处理
│   └── platform.js             # 平台兼容
│
├── constants/                  # 常量定义
│   ├── index.js                # 常量入口
│   ├── api.js                  # API常量
│   ├── status.js               # 状态常量
│   ├── storage.js              # 存储键常量
│   └── config.js               # 配置常量
│
├── assets/                     # 静态资源
│   ├── images/                 # 图片资源
│   │   ├── icons/              # 图标
│   │   ├── backgrounds/        # 背景图
│   │   └── empty/              # 空状态图
│   └── fonts/                  # 字体文件
│
├── styles/                     # 全局样式
│   ├── variables.wxss          # 样式变量
│   ├── mixins.wxss             # 样式混入
│   ├── reset.wxss              # 样式重置
│   └── animations.wxss         # 动画样式
│
├── types/                      # 类型定义
│   ├── index.d.ts              # 类型入口
│   ├── api.d.ts                # API类型
│   ├── entity.d.ts             # 实体类型
│   └── store.d.ts              # 状态类型
│
└── miniprogram_npm/            # npm包目录
    └── mobx-miniprogram/
```

### 4.2 分包目录结构

```
├── app.json                    # 分包配置
{
  "pages": [
    "pages/index/index",
    "pages/my/my"
  ],
  "subpackages": [
    {
      "root": "packageCamp",
      "name": "camp",
      "pages": [
        "pages/camp-list/index",
        "pages/camp-detail/index"
      ]
    },
    {
      "root": "packageSelector",
      "name": "selector",
      "pages": [
        "pages/selector/index",
        "pages/university-list/index",
        "pages/major-list/index"
      ]
    },
    {
      "root": "packageReminder",
      "name": "reminder",
      "pages": [
        "pages/my-reminders/index",
        "pages/reminder-create/index"
      ]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["camp"]
    }
  }
}
```

---

## 5. 状态管理设计

### 5.1 状态管理架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           状态管理架构                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         全局状态 (Global Store)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  用户状态   │  │  系统状态   │  │  配置状态   │  │  缓存状态   │    │   │
│  │  │  userStore  │  │  appStore   │  │  configStore│  │  cacheStore │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         模块状态 (Module Store)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  夏令营状态 │  │  提醒状态   │  │  选择状态   │  │  院校状态   │    │   │
│  │  │  campStore  │  │reminderStore│  │selectionStore│ │universityStore│   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         页面状态 (Page State)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  列表状态   │  │  筛选状态   │  │  表单状态   │  │  UI状态     │    │   │
│  │  │  listState  │  │ filterState │  │  formState  │  │  uiState    │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Store设计示例

#### 5.2.1 全局用户状态

```typescript
import { observable, action, computed, makeObservable } from 'mobx-miniprogram'

export class UserStore {
  @observable
  userInfo: UserInfo | null = null

  @observable
  token: string = ''

  @observable
  isLoggedIn: boolean = false

  @observable
  selection: UserSelection | null = null

  @computed
  get userId(): string {
    return this.userInfo?.id || ''
  }

  @computed
  get selectedUniversityIds(): string[] {
    return this.selection?.universityIds || []
  }

  @computed
  get selectedMajorIds(): string[] {
    return this.selection?.majorIds || []
  }

  @action
  setUserInfo(userInfo: UserInfo) {
    this.userInfo = userInfo
    this.isLoggedIn = true
  }

  @action
  setToken(token: string) {
    this.token = token
    wx.setStorageSync('token', token)
  }

  @action
  setSelection(selection: UserSelection) {
    this.selection = selection
  }

  @action
  logout() {
    this.userInfo = null
    this.token = ''
    this.isLoggedIn = false
    this.selection = null
    wx.removeStorageSync('token')
  }

  constructor() {
    makeObservable(this)
    this.initFromStorage()
  }

  initFromStorage() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.token = token
    }
  }
}

export const userStore = new UserStore()
```

#### 5.2.2 夏令营模块状态

```typescript
import { observable, action, computed, makeObservable, runInAction } from 'mobx-miniprogram'
import { campService } from './service'

export class CampStore {
  @observable
  campList: CampInfo[] = []

  @observable
  currentCamp: CampInfo | null = null

  @observable
  loading: boolean = false

  @observable
  loadingMore: boolean = false

  @observable
  hasMore: boolean = true

  @observable
  page: number = 1

  @observable
  pageSize: number = 20

  @observable
  filters: CampFilters = {
    universityIds: [],
    majorIds: [],
    status: 'published'
  }

  @computed
  get filteredCampList(): CampInfo[] {
    return this.campList.filter(camp => {
      if (this.filters.status && camp.status !== this.filters.status) {
        return false
      }
      return true
    })
  }

  @computed
  get urgentCamps(): CampInfo[] {
    const now = new Date()
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    return this.campList.filter(camp => {
      if (!camp.deadline) return false
      const deadline = new Date(camp.deadline)
      return deadline <= threeDaysLater && deadline >= now
    })
  }

  @action
  setFilters(filters: Partial<CampFilters>) {
    this.filters = { ...this.filters, ...filters }
    this.page = 1
    this.hasMore = true
  }

  @action
  async fetchCampList(isRefresh: boolean = false) {
    if (this.loading || this.loadingMore) return

    if (isRefresh) {
      this.page = 1
      this.hasMore = true
    }

    if (!isRefresh && !this.hasMore) return

    try {
      if (this.page === 1) {
        this.loading = true
      } else {
        this.loadingMore = true
      }

      const { list, total } = await campService.getCampList({
        ...this.filters,
        page: this.page,
        pageSize: this.pageSize
      })

      runInAction(() => {
        if (isRefresh || this.page === 1) {
          this.campList = list
        } else {
          this.campList = [...this.campList, ...list]
        }
        this.hasMore = this.campList.length < total
        this.page++
      })
    } catch (error) {
      console.error('获取夏令营列表失败:', error)
      throw error
    } finally {
      runInAction(() => {
        this.loading = false
        this.loadingMore = false
      })
    }
  }

  @action
  async fetchCampDetail(campId: string) {
    this.loading = true
    try {
      const camp = await campService.getCampDetail(campId)
      runInAction(() => {
        this.currentCamp = camp
      })
      return camp
    } catch (error) {
      console.error('获取夏令营详情失败:', error)
      throw error
    } finally {
      runInAction(() => {
        this.loading = false
      })
    }
  }

  @action
  reset() {
    this.campList = []
    this.currentCamp = null
    this.page = 1
    this.hasMore = true
    this.filters = {
      universityIds: [],
      majorIds: [],
      status: 'published'
    }
  }

  constructor() {
    makeObservable(this)
  }
}

export const campStore = new CampStore()
```

### 5.3 状态持久化策略

| 数据类型 | 存储方式 | 过期时间 | 说明 |
|----------|----------|----------|------|
| 用户Token | wx.setStorageSync | 7天 | 自动续期 |
| 用户选择 | wx.setStorageSync | 永久 | 本地备份 |
| 院校列表 | wx.setStorageSync | 1天 | 减少请求 |
| 夏令营列表 | 内存 + Storage | 1小时 | 双层缓存 |
| 搜索历史 | wx.setStorageSync | 30天 | 最多20条 |

---

## 6. 组件设计模式

### 6.1 组件分层架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           组件分层架构                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         页面组件 (Page Component)                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │  职责: 页面逻辑、路由、生命周期、状态订阅                         │    │   │
│  │  │  示例: pages/camp-detail/index.js                               │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         业务组件 (Business Component)                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │  职责: 业务逻辑封装、数据展示、交互处理                           │    │   │
│  │  │  示例: camp-card, reminder-item, filter-bar                     │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         基础组件 (Base Component)                        │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │  职责: UI展示、样式封装、无业务逻辑                               │    │   │
│  │  │  示例: button, icon, loading, empty, skeleton                   │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 组件设计规范

#### 6.2.1 基础组件示例 - Button

```typescript
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    type: {
      type: String,
      value: 'primary'
    },
    size: {
      type: String,
      value: 'default'
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    },
    block: {
      type: Boolean,
      value: false
    }
  },

  data: {
    pressActive: false
  },

  methods: {
    handleTap(e: TouchEvent) {
      if (this.properties.disabled || this.properties.loading) {
        return
      }
      this.triggerEvent('tap', e.detail)
    },

    handleTouchStart() {
      if (!this.properties.disabled) {
        this.setData({ pressActive: true })
      }
    },

    handleTouchEnd() {
      this.setData({ pressActive: false })
    }
  }
})
```

```xml
<button
  class="custom-button {{type}} {{size}} {{disabled ? 'disabled' : ''}} {{block ? 'block' : ''}} {{pressActive ? 'press-active' : ''}}"
  bindtap="handleTap"
  bindtouchstart="handleTouchStart"
  bindtouchend="handleTouchEnd"
  disabled="{{disabled}}"
>
  <view class="button-content">
    <view wx:if="{{loading}}" class="loading-icon">
      <view class="loading-spinner"></view>
    </view>
    <slot></slot>
  </view>
</button>
```

#### 6.2.2 业务组件示例 - CampCard

```typescript
import { formatDate, getDaysRemaining } from '../../utils/date'

Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    camp: {
      type: Object,
      value: {}
    },
    showUniversity: {
      type: Boolean,
      value: true
    }
  },

  data: {
    daysRemaining: 0,
    deadlineText: '',
    statusClass: ''
  },

  observers: {
    'camp.deadline': function(deadline: string) {
      if (deadline) {
        const days = getDaysRemaining(deadline)
        this.setData({
          daysRemaining: days,
          deadlineText: this.formatDeadline(days, deadline),
          statusClass: this.getStatusClass(days)
        })
      }
    }
  },

  methods: {
    formatDeadline(days: number, deadline: string): string {
      if (days < 0) return '已截止'
      if (days === 0) return '今天截止'
      if (days === 1) return '明天截止'
      return `${formatDate(deadline)} 截止`
    },

    getStatusClass(days: number): string {
      if (days < 0) return 'expired'
      if (days <= 3) return 'urgent'
      if (days <= 7) return 'warning'
      return 'normal'
    },

    handleTap() {
      const { camp } = this.properties
      this.triggerEvent('tap', { campId: camp.id })
    },

    handleRemindTap(e: TouchEvent) {
      e.stopPropagation()
      const { camp } = this.properties
      this.triggerEvent('remind', { campId: camp.id })
    }
  }
})
```

```xml
<view class="camp-card {{statusClass}}" bindtap="handleTap">
  <view class="card-header">
    <image 
      wx:if="{{showUniversity && camp.universityLogo}}" 
      class="university-logo" 
      src="{{camp.universityLogo}}" 
      mode="aspectFit"
      lazy-load
    />
    <view class="header-info">
      <text class="university-name" wx:if="{{showUniversity}}">{{camp.universityName}}</text>
      <text class="camp-title">{{camp.title}}</text>
    </view>
  </view>

  <view class="card-body">
    <view class="info-row">
      <view class="info-item">
        <text class="label">举办时间</text>
        <text class="value">{{camp.startDate}} ~ {{camp.endDate}}</text>
      </view>
    </view>
    <view class="info-row" wx:if="{{camp.location}}">
      <view class="info-item">
        <text class="label">举办地点</text>
        <text class="value">{{camp.location}}</text>
      </view>
    </view>
  </view>

  <view class="card-footer">
    <view class="deadline {{statusClass}}">
      <text class="deadline-text">{{deadlineText}}</text>
      <text class="days-remaining" wx:if="{{daysRemaining > 0}}">剩余{{daysRemaining}}天</text>
    </view>
    <view class="actions">
      <button 
        class="remind-btn" 
        size="mini" 
        catchtap="handleRemindTap"
      >
        设置提醒
      </button>
    </view>
  </view>
</view>
```

### 6.3 组件通信模式

| 通信方式 | 使用场景 | 示例 |
|----------|----------|------|
| 属性传递 | 父→子数据传递 | `<camp-card camp="{{campData}}" />` |
| 事件触发 | 子→父数据传递 | `this.triggerEvent('tap', data)` |
| 全局状态 | 跨组件共享状态 | `userStore.userInfo` |
| 页面栈通信 | 页面间通信 | `getCurrentPages()[0].setData()` |
| 事件总线 | 跨页面通信 | `eventBus.emit('refresh', data)` |

---

## 7. API交互层设计

### 7.1 HTTP请求封装

```typescript
import { userStore } from '../store/user'

interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: Record<string, string>
  showLoading?: boolean
  showError?: boolean
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

const BASE_URL = 'https://api.baoyan.com/v1'

class HttpClient {
  private requestQueue: Map<string, boolean> = new Map()

  async request<T>(config: RequestConfig): Promise<T> {
    const { url, method = 'GET', data, header = {}, showLoading = true, showError = true } = config

    const requestKey = `${method}-${url}`
    if (this.requestQueue.has(requestKey)) {
      return Promise.reject(new Error('重复请求'))
    }
    this.requestQueue.set(requestKey, true)

    if (showLoading) {
      wx.showLoading({ title: '加载中...', mask: true })
    }

    try {
      const token = userStore.token
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...header
      }

      const response = await new Promise<ApiResponse<T>>((resolve, reject) => {
        wx.request({
          url: `${BASE_URL}${url}`,
          method,
          data,
          header: headers,
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data as ApiResponse<T>)
            } else if (res.statusCode === 401) {
              this.handleUnauthorized()
              reject(new Error('登录已过期'))
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: (err) => {
            reject(new Error(err.errMsg || '网络请求失败'))
          }
        })
      })

      if (response.code !== 0) {
        throw new Error(response.message || '请求失败')
      }

      return response.data
    } catch (error: any) {
      if (showError) {
        wx.showToast({
          title: error.message || '请求失败',
          icon: 'none',
          duration: 2000
        })
      }
      throw error
    } finally {
      this.requestQueue.delete(requestKey)
      if (showLoading) {
        wx.hideLoading()
      }
    }
  }

  private handleUnauthorized() {
    userStore.logout()
    wx.navigateTo({ url: '/pages/index/index' })
  }

  get<T>(url: string, params?: any, config?: Partial<RequestConfig>): Promise<T> {
    const queryString = params ? this.buildQueryString(params) : ''
    return this.request<T>({
      url: queryString ? `${url}?${queryString}` : url,
      method: 'GET',
      ...config
    })
  }

  post<T>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'POST',
      data,
      ...config
    })
  }

  put<T>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'PUT',
      data,
      ...config
    })
  }

  delete<T>(url: string, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'DELETE',
      ...config
    })
  }

  private buildQueryString(params: Record<string, any>): string {
    return Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}=${value.join(',')}`
        }
        return `${key}=${encodeURIComponent(value)}`
      })
      .join('&')
  }
}

export const http = new HttpClient()
```

### 7.2 API服务层示例

```typescript
import { http } from './http'
import { CampInfo, CampFilters, PageResponse } from '../types'

export const campService = {
  getCampList(params: CampFilters & { page: number; pageSize: number }): Promise<PageResponse<CampInfo>> {
    return http.get<PageResponse<CampInfo>>('/camps', params)
  },

  getCampDetail(campId: string): Promise<CampInfo> {
    return http.get<CampInfo>(`/camps/${campId}`)
  },

  getUrgentCamps(): Promise<CampInfo[]> {
    return http.get<CampInfo[]>('/camps/urgent')
  }
}
```

```typescript
import { http } from './http'
import { Reminder, CreateReminderParams } from '../types'

export const reminderService = {
  createReminder(params: CreateReminderParams): Promise<Reminder> {
    return http.post<Reminder>('/reminders', params)
  },

  deleteReminder(reminderId: string): Promise<void> {
    return http.delete<void>(`/reminders/${reminderId}`)
  },

  getReminderList(): Promise<Reminder[]> {
    return http.get<Reminder[]>('/reminders')
  }
}
```

### 7.3 接口缓存策略

| 接口类型 | 缓存策略 | 过期时间 | 刷新策略 |
|----------|----------|----------|----------|
| 院校列表 | 本地缓存 | 1天 | 下拉刷新 |
| 专业列表 | 本地缓存 | 1天 | 下拉刷新 |
| 夏令营列表 | 内存缓存 | 10分钟 | 自动刷新 |
| 夏令营详情 | 内存缓存 | 5分钟 | 进入页面刷新 |
| 用户选择 | 本地缓存 | 永久 | 修改后更新 |
| 提醒列表 | 无缓存 | - | 每次请求 |

---

## 8. 性能优化方案

### 8.1 性能优化目标

| 指标 | 目标值 | 优化策略 |
|------|--------|----------|
| 首屏加载时间 | < 1.5s | 分包加载、骨架屏、数据预加载 |
| 列表滚动帧率 | > 50fps | 虚拟列表、图片懒加载 |
| 页面切换时间 | < 300ms | 预加载、缓存页面数据 |
| 内存占用 | < 100MB | 及时释放、避免内存泄漏 |
| 包体积 | 主包 < 1.5MB | 分包、资源CDN、代码压缩 |

### 8.2 分包加载策略

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           分包加载策略                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  主包 (Main Package) - 1.5MB                                                   │
│  ├── pages/index/              # 首页                                          │
│  ├── pages/my/                 # 个人中心                                      │
│  ├── components/base/          # 基础组件                                      │
│  ├── store/                    # 状态管理                                      │
│  ├── utils/                    # 工具函数                                      │
│  └── app.js/app.json/app.wxss  # 全局配置                                      │
│                                                                                 │
│  分包1: camp (夏令营模块) - 500KB                                               │
│  ├── pages/camp-list/          # 夏令营列表                                    │
│  ├── pages/camp-detail/        # 夏令营详情                                    │
│  ├── components/camp-card/     # 夏令营卡片                                    │
│  └── modules/camp/             # 夏令营模块                                    │
│                                                                                 │
│  分包2: selector (选择模块) - 400KB                                             │
│  ├── pages/selector/           # 选择页                                        │
│  ├── pages/university-list/    # 院校列表                                      │
│  ├── pages/major-list/         # 专业列表                                      │
│  └── modules/selection/        # 选择模块                                      │
│                                                                                 │
│  分包3: reminder (提醒模块) - 300KB                                             │
│  ├── pages/my-reminders/       # 我的提醒                                      │
│  ├── pages/reminder-create/    # 创建提醒                                      │
│  └── modules/reminder/         # 提醒模块                                      │
│                                                                                 │
│  独立分包: webview (网页模块) - 100KB                                           │
│  └── pages/webview/            # 原文链接跳转                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 首屏加载优化

```typescript
App({
  onLaunch() {
    this.preloadCriticalData()
  },

  async preloadCriticalData() {
    const cache = wx.getStorageSync('universities')
    if (!cache) {
      universityStore.fetchUniversityList()
    }
    
    if (userStore.token) {
      userStore.fetchUserInfo()
    }
  }
})
```

### 8.4 图片优化策略

| 优化项 | 实现方式 | 效果 |
|--------|----------|------|
| 懒加载 | `lazy-load` 属性 | 减少首屏请求 |
| CDN加速 | 图片存储OSS+CDN | 加速图片加载 |
| 格式优化 | WebP格式 | 减少50%体积 |
| 尺寸适配 | 根据设备像素比加载 | 避免加载过大图片 |
| 占位图 | 本地默认图 | 提升用户体验 |

```xml
<image 
  class="university-logo" 
  src="{{camp.universityLogo}}" 
  mode="aspectFit"
  lazy-load
  binderror="handleImageError"
  bindload="handleImageLoad"
/>
```

### 8.5 列表性能优化

```typescript
Page({
  data: {
    campList: [],
    loading: false,
    loadingMore: false,
    hasMore: true
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  async loadMore() {
    this.setData({ loadingMore: true })
    try {
      await campStore.fetchCampList()
      this.setData({
        campList: campStore.campList,
        hasMore: campStore.hasMore
      })
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  onPullDownRefresh() {
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      await campStore.fetchCampList(true)
      this.setData({ campList: campStore.campList })
      wx.stopPullDownRefresh()
    } finally {
      this.setData({ loading: false })
    }
  }
})
```

---

## 9. 安全设计

### 9.1 安全风险与防护策略

| 风险类型 | 风险描述 | 防护策略 |
|----------|----------|----------|
| XSS攻击 | 恶意脚本注入 | 数据转义、富文本过滤 |
| CSRF攻击 | 跨站请求伪造 | Token验证、Referer检查 |
| 数据泄露 | 敏感数据暴露 | 加密存储、HTTPS传输 |
| 接口滥用 | 恶意请求攻击 | 限流、签名验证 |
| 代码泄露 | 源码被反编译 | 代码混淆、敏感信息后端处理 |

### 9.2 XSS防护实现

```typescript
export function escapeHtml(str: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  }
  return str.replace(/[&<>"'/]/g, char => escapeMap[char])
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/g, '')
    .replace(/javascript:/gi, '')
}
```

### 9.3 敏感数据处理

```typescript
export const secureStorage = {
  set(key: string, value: any, expireTime?: number) {
    const data = {
      value,
      expireTime: expireTime ? Date.now() + expireTime : null
    }
    wx.setStorageSync(key, JSON.stringify(data))
  },

  get(key: string): any {
    const dataStr = wx.getStorageSync(key)
    if (!dataStr) return null

    try {
      const data = JSON.parse(dataStr)
      if (data.expireTime && Date.now() > data.expireTime) {
        wx.removeStorageSync(key)
        return null
      }
      return data.value
    } catch {
      return null
    }
  },

  remove(key: string) {
    wx.removeStorageSync(key)
  },

  clear() {
    wx.clearStorageSync()
  }
}
```

### 9.4 权限控制

```typescript
export const permission = {
  checkLogin(): boolean {
    return userStore.isLoggedIn
  },

  requireLogin(callback: () => void) {
    if (this.checkLogin()) {
      callback()
    } else {
      wx.navigateTo({ url: '/pages/index/index' })
    }
  },

  async checkSubscription(templateId: string): Promise<boolean> {
    const settings = await wx.getSetting()
    return settings.subscriptionsSetting[templateId] === 'accept'
  },

  async requestSubscription(templateIds: string[]): Promise<boolean> {
    try {
      const result = await wx.requestSubscribeMessage({
        tmplIds: templateIds
      })
      return templateIds.every(id => result[id] === 'accept')
    } catch {
      return false
    }
  }
}
```

---

## 10. 工程化实践

### 10.1 代码规范

#### 10.1.1 ESLint配置

```json
{
  "extends": ["eslint:recommended", "@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "no-unused-vars": "error",
    "no-console": "warn",
    "prefer-const": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-module-boundary-types": "off"
  },
  "globals": {
    "wx": "readonly",
    "App": "readonly",
    "Page": "readonly",
    "Component": "readonly",
    "getApp": "readonly",
    "getCurrentPages": "readonly"
  }
}
```

#### 10.1.2 Prettier配置

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### 10.2 Git提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

| Type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复Bug |
| docs | 文档更新 |
| style | 代码格式调整 |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具变动 |

### 10.3 构建流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           构建流程                                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  开发环境                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                        │
│  │  代码编写   │ -> │  ESLint检查 │ -> │  热更新预览 │                        │
│  └─────────────┘    └─────────────┘    └─────────────┘                        │
│                                                                                 │
│  生产环境                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │  代码编写   │ -> │  ESLint检查 │ -> │  TypeScript │ -> │  代码压缩   │    │
│  └─────────────┘    └─────────────┘    │  编译       │    └─────────────┘    │
│                                        └─────────────┘           │            │
│                                                                  ▼            │
│                                        ┌─────────────┐    ┌─────────────┐    │
│                                        │  上传代码   │ <- │  构建npm    │    │
│                                        └─────────────┘    └─────────────┘    │
│                                              │                                  │
│                                              ▼                                  │
│                                        ┌─────────────┐                        │
│                                        │  提交审核   │                        │
│                                        └─────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 CI/CD流程

```yaml
stages:
  - lint
  - build
  - deploy

lint:
  stage: lint
  script:
    - npm install
    - npm run lint
  only:
    - merge_requests

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - miniprogram/
  only:
    - main

deploy:
  stage: deploy
  script:
    - npm run upload
  only:
    - main
  when: manual
```

---

## 11. 测试策略

### 11.1 测试金字塔

```
                    ┌─────────────┐
                    │   E2E测试   │  10%
                    │  (关键流程) │
                ┌───┴─────────────┴───┐
                │     集成测试        │  20%
                │   (API + Store)     │
            ┌───┴─────────────────────┴───┐
            │          单元测试            │  70%
            │  (Utils + Components)       │
            └─────────────────────────────┘
```

### 11.2 单元测试示例

```typescript
import { formatDate, getDaysRemaining } from '../utils/date'

describe('Date Utils', () => {
  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = '2024-06-15'
      expect(formatDate(date)).toBe('2024年6月15日')
    })
  })

  describe('getDaysRemaining', () => {
    it('should return correct days remaining', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 5)
      expect(getDaysRemaining(futureDate.toISOString())).toBe(5)
    })

    it('should return negative for past date', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)
      expect(getDaysRemaining(pastDate.toISOString())).toBe(-1)
    })
  })
})
```

### 11.3 组件测试示例

```typescript
const mockCamp = {
  id: '1',
  title: '测试夏令营',
  universityName: '测试大学',
  deadline: '2024-06-30',
  status: 'published'
}

Component({
  properties: {
    camp: {
      type: Object,
      value: mockCamp
    }
  }
})

describe('CampCard Component', () => {
  it('should render camp title', () => {
    const comp = createComponent('camp-card', { camp: mockCamp })
    expect(comp.data.camp.title).toBe('测试夏令营')
  })

  it('should emit tap event', () => {
    const comp = createComponent('camp-card', { camp: mockCamp })
    comp.triggerEvent('tap')
    expect(comp.emittedEvents.tap).toBeTruthy()
  })
})
```

---

## 12. 验证方案

### 12.1 原型验证

| 验证项 | 验证方法 | 通过标准 |
|--------|----------|----------|
| 页面流程 | 完整走查 | 流程顺畅无阻塞 |
| 组件复用 | 统计复用率 | 复用率>60% |
| 状态管理 | 状态追踪 | 状态变化可预测 |
| 性能指标 | 性能面板 | 首屏<1.5s |

### 12.2 性能测试

```typescript
export const performance = {
  measurePageLoad(pageName: string) {
    const start = Date.now()
    return {
      end: () => {
        const duration = Date.now() - start
        console.log(`[${pageName}] 加载时间: ${duration}ms`)
        if (duration > 1500) {
          console.warn(`[${pageName}] 加载时间超过目标值`)
        }
      }
    }
  },

  measureApiRequest(apiName: string) {
    const start = Date.now()
    return {
      end: () => {
        const duration = Date.now() - start
        console.log(`[${apiName}] 请求时间: ${duration}ms`)
        if (duration > 1000) {
          console.warn(`[${apiName}] 请求时间过长`)
        }
      }
    }
  }
}
```

### 12.3 可扩展性测试

| 测试场景 | 测试方法 | 预期结果 |
|----------|----------|----------|
| 新增页面 | 添加新页面路由 | 无需修改现有代码 |
| 新增组件 | 创建新组件 | 自动注册可用 |
| 新增API | 添加API服务 | 无需修改HTTP层 |
| 状态扩展 | 添加新Store | 自动集成到全局 |

---

## 13. 架构决策记录

### 13.1 ADR-001: 选择微信小程序原生开发

**状态**: 已采纳

**背景**: 需要选择小程序开发框架

**决策**: 选择微信小程序原生开发

**理由**:
1. 项目仅需支持微信平台，无跨端需求
2. 原生开发性能最优，包体积最小
3. 微信订阅消息等API支持最完整
4. 调试工具完善，开发效率高

**影响**:
- 无法复用Web端代码
- 需要学习小程序特有API

### 13.2 ADR-002: 选择MobX作为状态管理

**状态**: 已采纳

**背景**: 需要选择状态管理方案

**决策**: 选择MobX

**理由**:
1. 响应式编程，代码简洁直观
2. 学习成本低，团队快速上手
3. 与TypeScript配合良好
4. 社区活跃，文档完善

**影响**:
- 需要引入mobx-miniprogram依赖
- 需要理解响应式编程概念

### 13.3 ADR-003: 采用分包加载策略

**状态**: 已采纳

**背景**: 主包体积限制2MB

**决策**: 采用分包加载，主包仅包含核心页面

**理由**:
1. 主包体积控制在1.5MB以内
2. 按业务模块分包，便于维护
3. 预加载策略提升用户体验
4. 独立分包支持Webview页面

**影响**:
- 需要合理规划分包边界
- 首次进入分包页面有加载时间

---

## 14. 附录

### 14.1 类型定义

```typescript
interface UserInfo {
  id: string
  openid: string
  nickname?: string
  avatar?: string
}

interface University {
  id: string
  name: string
  shortName?: string
  logo?: string
  region?: string
  level?: '985' | '211' | '双一流' | '普通'
}

interface Major {
  id: string
  name: string
  code?: string
  category?: string
  universityId: string
}

interface CampInfo {
  id: string
  universityId: string
  majorId?: string
  title: string
  sourceUrl: string
  publishDate?: string
  deadline?: string
  startDate?: string
  endDate?: string
  location?: string
  requirements?: Record<string, any>
  materials?: string[]
  process?: ProcessStep[]
  status: 'draft' | 'published' | 'expired'
  confidence?: number
  universityName?: string
  universityLogo?: string
}

interface ProcessStep {
  step: number
  action: string
  deadline?: string
  note?: string
}

interface UserSelection {
  userId: string
  universityIds: string[]
  majorIds: string[]
}

interface Reminder {
  id: string
  userId: string
  campId: string
  remindTime: string
  remindType: 'deadline' | 'custom'
  status: 'pending' | 'sent' | 'failed' | 'expired'
  templateId?: string
  sentAt?: string
}

interface CampFilters {
  universityIds?: string[]
  majorIds?: string[]
  status?: 'draft' | 'published' | 'expired'
}

interface PageResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

### 14.2 常量定义

```typescript
export const API_BASE_URL = 'https://api.baoyan.com/v1'

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'userInfo',
  USER_SELECTION: 'userSelection',
  UNIVERSITIES: 'universities',
  SEARCH_HISTORY: 'searchHistory'
}

export const CAMP_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  EXPIRED: 'expired'
}

export const REMINDER_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  EXPIRED: 'expired'
}

export const CACHE_EXPIRE = {
  UNIVERSITIES: 24 * 60 * 60 * 1000,
  CAMPS: 10 * 60 * 1000,
  CAMP_DETAIL: 5 * 60 * 1000
}
```

---

**文档结束**
