# 保研信息助手小程序 - 开发环境配置指南

**文档版本**: v1.0  
**创建日期**: 2026-02-25  
**适用平台**: macOS

---

## 环境要求

### 必需组件

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | 20.x LTS | 后端服务运行环境 |
| Python | 3.11+ | 爬虫服务运行环境 |
| MySQL | 8.0+ | 关系型数据库 |
| Redis | 7.0+ | 缓存和消息队列 |
| Git | 最新版 | 版本控制 |

### 可选组件

| 组件 | 用途 |
|------|------|
| Homebrew | macOS包管理器 |
| Docker | 容器化部署 |
| VS Code | 代码编辑器 |

---

## 快速开始

### 方式一：自动安装（推荐）

```bash
# 1. 进入项目目录
cd /Users/lusansui/Documents/trae_build_project/project_baoyan

# 2. 运行环境安装脚本
./setup-environment.sh

# 3. 验证环境
./verify-environment.sh
```

### 方式二：手动安装

#### 步骤1：安装 Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 步骤2：安装 Node.js 20 LTS

```bash
# 使用 Homebrew 安装
brew install node@20

# 链接 Node.js
brew link node@20 --force

# 验证安装
node --version  # 应显示 v20.x.x
npm --version   # 应显示 10.x.x
```

#### 步骤3：安装 Python 3.11

```bash
# 使用 Homebrew 安装
brew install python@3.11

# 验证安装
python3.11 --version  # 应显示 Python 3.11.x
```

#### 步骤4：安装数据库

```bash
# 安装 MySQL
brew install mysql@8.0

# 启动 MySQL 服务
brew services start mysql

# 安装 Redis
brew install redis

# 启动 Redis 服务
brew services start redis
```

#### 步骤5：安装项目依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装爬虫依赖
cd ../crawler
pip3 install -r requirements.txt
```

---

## 详细配置

### 1. 数据库配置

#### 1.1 MySQL 配置

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE baoyan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 创建用户（可选）
CREATE USER 'baoyan_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON baoyan.* TO 'baoyan_user'@'localhost';
FLUSH PRIVILEGES;
```

#### 1.2 Redis 配置

Redis 默认配置即可使用，如需修改配置：

```bash
# 编辑 Redis 配置文件
vim /usr/local/etc/redis.conf

# 重启 Redis
brew services restart redis
```

### 2. 环境变量配置

```bash
# 复制环境变量模板
cd backend
cp .env.example .env

# 编辑 .env 文件，填写以下配置：
# - DATABASE_URL: 数据库连接字符串
# - REDIS_HOST/PORT: Redis 连接信息
# - WECHAT_APPID/SECRET: 微信小程序配置
# - DEEPSEEK_API_KEY: DeepSeek API 密钥
# - JWT_SECRET: JWT 签名密钥
```

### 3. Prisma 初始化

```bash
cd backend

# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev --name init

# 启动 Prisma Studio（可选，用于可视化查看数据库）
npx prisma studio
```

---

## 启动开发服务器

### 启动后端服务

```bash
cd backend

# 开发模式（带热重载）
npm run start:dev

# 生产模式
npm run start:prod
```

后端服务默认运行在 http://localhost:3000

### 启动爬虫服务

```bash
cd crawler

# 运行爬虫
scrapy crawl university_name

# 查看可用爬虫列表
scrapy list
```

### 启动小程序前端

使用微信开发者工具打开 `miniprogram` 目录。

---

## 验证环境

运行验证脚本检查环境是否配置正确：

```bash
./verify-environment.sh
```

预期输出：
```
==========================================
保研信息助手 - 开发环境验证
==========================================

验证 Node.js...
✓ Node.js 已安装: v20.x.x
✓ Node.js 版本符合要求 (20.x LTS)

验证 npm...
✓ npm 已安装: 10.x.x

验证 Python...
✓ Python 已安装: Python 3.11.x

验证 pip...
✓ pip 已安装: pip x.x.x

验证 Git...
✓ Git 已安装: git version x.x.x

验证项目结构...
✓ 目录存在: backend
✓ 目录存在: crawler
✓ 目录存在: miniprogram
...

==========================================
✓ 所有环境检查通过！
==========================================
```

---

## 常见问题

### Q1: Node.js 安装失败

**解决方案**：
```bash
# 使用 nvm 安装
brew install nvm
source ~/.nvm/nvm.sh
nvm install 20
nvm use 20
nvm alias default 20
```

### Q2: Python 包安装失败

**解决方案**：
```bash
# 升级 pip
pip3 install --upgrade pip

# 使用虚拟环境
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Q3: 数据库连接失败

**解决方案**：
1. 检查 MySQL 服务是否启动：`brew services list`
2. 检查数据库是否创建：`mysql -u root -p -e "SHOW DATABASES;"`
3. 检查环境变量配置是否正确

### Q4: 端口被占用

**解决方案**：
```bash
# 查找占用 3000 端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>
```

---

## 开发工具推荐

### 代码编辑器
- **VS Code**（推荐）
  - 插件：ESLint、Prettier、Prisma、Python

### API 测试工具
- Postman
- Insomnia

### 数据库管理工具
- DBeaver（免费）
- TablePlus
- DataGrip

### Redis 管理工具
- Another Redis Desktop Manager（免费）
- RedisInsight

---

## 项目结构说明

```
project_baoyan/
├── backend/                    # NestJS 后端服务
│   ├── src/
│   │   ├── modules/           # 业务模块
│   │   ├── common/            # 公共模块
│   │   └── config/            # 配置文件
│   ├── prisma/
│   │   └── schema.prisma      # 数据库模型
│   └── package.json           # 依赖配置
│
├── crawler/                    # Python 爬虫服务
│   ├── baoyan_crawler/
│   │   ├── spiders/           # 爬虫
│   │   ├── middlewares/       # 中间件
│   │   └── utils/             # 工具
│   └── requirements.txt       # Python 依赖
│
├── miniprogram/               # 微信小程序前端
│   ├── pages/                 # 页面
│   ├── components/            # 组件
│   └── services/              # API 服务
│
├── setup-environment.sh       # 环境安装脚本
├── verify-environment.sh      # 环境验证脚本
└── DEVELOPMENT_ENVIRONMENT_GUIDE.md  # 本指南
```

---

## 下一步

环境配置完成后，请参考以下文档开始开发：

1. [MVP_DEVELOPMENT_PLAN_v2.1.md](MVP_DEVELOPMENT_PLAN_v2.1.md) - 开发计划
2. [ARCHITECTURE_v1.0.md](ARCHITECTURE_v1.0.md) - 架构设计
3. [PRD_v1.0.md](PRD_v1.0.md) - 产品需求文档

---

**文档结束**
