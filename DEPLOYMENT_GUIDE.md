# 保研信息助手 - 生产环境部署指南

**版本**: v1.0  
**日期**: 2026-02-25  
**分支**: deployment/production

---

## 0.1 当前实际生产配置（2026-03-19）

本章节描述当前线上已验证可用的真实部署方式。下面旧章节中的 Linux、PM2、Nginx 方案属于通用参考，不代表当前正在运行的生产实例。

### 当前线上拓扑

- 服务器系统：Windows Server 2022
- 公网 IP：`111.231.64.155`
- 生产域名：`https://baoyanwang-helper.cn`
- 后端监听：`http://127.0.0.1:3000`
- 反向代理：Caddy
- 进程托管：NSSM Windows Services
- 小程序 API Base URL：`https://baoyanwang-helper.cn/api/v1`

### 当前线上关键路径

- 项目目录：`C:\Users\Administrator\project_baoyan`
- 后端入口：`C:\Users\Administrator\project_baoyan\backend\dist\src\main.js`
- Caddy 配置：`C:\caddy\Caddyfile`
- Caddy 证书目录：`C:\caddy\certs`
- 后端日志：`C:\Users\Administrator\backend.log`
- Caddy 日志：`C:\Users\Administrator\caddy.log`

### 当前线上 Caddy 配置要点

- 域名：`baoyanwang-helper.cn`
- 证书模式：固定证书文件，不走在线 ACME 自动签发
- 原因：此前 DNS 提供方页面干扰了证书挑战流程，导致自动签发不稳定
- 当前证书文件：
  - `C:/caddy/certs/baoyanwang-helper.cn.crt`
  - `C:/caddy/certs/baoyanwang-helper.cn.key`

典型配置如下：

```caddyfile
https://baoyanwang-helper.cn {
    tls C:/caddy/certs/baoyanwang-helper.cn.crt C:/caddy/certs/baoyanwang-helper.cn.key

    handle /health {
        reverse_proxy 127.0.0.1:3000
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}

http://baoyanwang-helper.cn {
    redir https://baoyanwang-helper.cn{uri} permanent
}
```

### 当前线上 Windows 服务

已验证运行中的服务：

- `baoyan-backend`
- `baoyan-caddy`

检查命令：

```cmd
sc query baoyan-backend
sc query baoyan-caddy
netstat -ano | findstr LISTENING | findstr :3000
netstat -ano | findstr LISTENING | findstr :443
curl.exe -i http://127.0.0.1:3000/health
curl.exe -i https://baoyanwang-helper.cn/health
```

预期结果：

- `baoyan-backend` 为 `RUNNING`
- `baoyan-caddy` 为 `RUNNING`
- `3000` 和 `443` 都有 `LISTENING`
- 两个 `/health` 都返回 `200`

### NSSM 服务安装命令

如果服务器重装或服务丢失，可使用下列命令恢复：

```cmd
cd C:\Users\Administrator\project_baoyan

choco install nssm -y --no-progress

nssm install baoyan-backend "C:\Program Files\nodejs\node.exe" "C:\Users\Administrator\project_baoyan\backend\dist\src\main.js"
nssm set baoyan-backend AppDirectory "C:\Users\Administrator\project_baoyan\backend"
nssm set baoyan-backend AppStdout "C:\Users\Administrator\backend.log"
nssm set baoyan-backend AppStderr "C:\Users\Administrator\backend.log"
nssm set baoyan-backend Start SERVICE_AUTO_START

nssm install baoyan-caddy "C:\ProgramData\chocolatey\bin\caddy.exe" "run --config C:\caddy\Caddyfile"
nssm set baoyan-caddy AppDirectory "C:\caddy"
nssm set baoyan-caddy AppStdout "C:\Users\Administrator\caddy.log"
nssm set baoyan-caddy AppStderr "C:\Users\Administrator\caddy.log"
nssm set baoyan-caddy Start SERVICE_AUTO_START

sc start baoyan-backend
sc start baoyan-caddy
```

### 后端发布步骤（当前实际可用）

在服务器 `cmd` 执行：

```cmd
cd C:\Users\Administrator\project_baoyan

npm --prefix backend install
npm --prefix backend run build

sc stop baoyan-backend
sc start baoyan-backend

curl.exe -i http://127.0.0.1:3000/health
curl.exe -i https://baoyanwang-helper.cn/health
```

### 小程序当前生产配置

当前小程序默认基址已切换为正式域名：

- [`miniprogram/app.js`](/Users/lusansui/Documents/trae_build_project/project_baoyan/miniprogram/app.js)
- [`miniprogram/services/http.js`](/Users/lusansui/Documents/trae_build_project/project_baoyan/miniprogram/services/http.js)

默认值：

```text
https://baoyanwang-helper.cn/api/v1
```

开发者工具验证：

```js
getApp().globalData.apiBaseUrl
```

预期输出：

```js
"https://baoyanwang-helper.cn/api/v1"
```

### 当前上线验收命令

Mac 本机：

```bash
curl -Iv https://baoyanwang-helper.cn/health --connect-timeout 8
```

预期：

- TLS 握手成功
- 返回 `HTTP/2 200`

开发者工具：

```js
wx.request({
  url: 'https://baoyanwang-helper.cn/health',
  success: r => console.log('health', r.statusCode, r.data),
  fail: e => console.error(e)
})

wx.request({
  url: 'https://baoyanwang-helper.cn/api/v1/camps?page=1&limit=20&status=published',
  success: r => console.log('camps', r.statusCode, r.data),
  fail: e => console.error(e)
})
```

登录态验证：

```js
wx.request({
  url: 'https://baoyanwang-helper.cn/api/v1/user/selection',
  header: {
    Authorization: `Bearer ${wx.getStorageSync('token')}`
  },
  success: res => console.log('selection =>', res.statusCode, res.data),
  fail: err => console.error('selection fail =>', err)
})
```

### 当前已知注意事项

- 当前 Caddy 使用固定证书文件，后续需要切换到稳定可续期的正式证书方案
- 如果开发者工具仍请求旧 `tcb.qcloud.la` 域名，先执行：

```js
wx.clearStorageSync()
wx.setStorageSync('apiBaseUrl', 'https://baoyanwang-helper.cn/api/v1')
getApp().globalData.apiBaseUrl = 'https://baoyanwang-helper.cn/api/v1'
```

- 如果服务掉线，优先检查：
  - `sc query baoyan-backend`
  - `sc query baoyan-caddy`
  - `type C:\Users\Administrator\backend.log`
  - `type C:\Users\Administrator\caddy.log`

---

## 0. 上线固定提醒清单（2026-03-01新增）

每次正式上线前，必须先完成以下两项：

1. 执行数据库迁移（部署环境）

```bash
npm --prefix backend run db:deploy
```

2. 配置并开启环境变量（后端与爬虫配置一致）

- `CRAWLER_INGEST_KEY`：后端与 Python 爬虫必须完全一致
- `WX_PROGRESS_CHANGE_TEMPLATE_ID`：进展变更模板（可回退 `WX_SUBSCRIBE_TEMPLATE_ID`）
- `WECHAT_ACTION_TOKEN_ENABLED=true`：开启微信一键确认跳转
- `AUTO_MATCH_ENABLED=true`：开启名单匹配引擎
- `AUTO_PROGRESS_HIGH_CONF_ENABLED=false`：先灰度关闭高置信自动推进，观察后再放量
- `DEEPSEEK_API_KEY`：生产可用密钥
- `DEEPSEEK_FALLBACK_ENABLED=true`：开启规则失败时的 LLM 兜底

---

## 一、部署架构

```
┌─────────────────────────────────────────────────────────┐
│                      负载均衡器 (Nginx)                   │
│                   SSL终止、请求分发                        │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   应用服务器1    │ │   应用服务器2    │ │   应用服务器N    │
│  (NestJS App)   │ │  (NestJS App)   │ │  (NestJS App)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
            │               │               │
            └───────────────┼───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Redis集群 (缓存层)                       │
│              会话存储、数据缓存、分布式锁                   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 MySQL主从集群 (数据层)                    │
│              主库写入、从库读取、自动备份                   │
└─────────────────────────────────────────────────────────┘
```

---

## 二、服务器环境要求

### 2.1 硬件配置

| 服务 | 配置 | 数量 | 说明 |
|------|------|------|------|
| 应用服务器 | 4核8G | 2+ | NestJS应用部署 |
| MySQL主库 | 4核8G | 1 | 数据写入 |
| MySQL从库 | 2核4G | 2 | 数据读取 |
| Redis节点 | 2核4G | 3 | 集群模式 |
| Nginx | 2核4G | 1 | 负载均衡 |

### 2.2 软件版本

| 软件 | 版本 | 说明 |
|------|------|------|
| Ubuntu Server | 22.04 LTS | 操作系统 |
| Node.js | 20.x LTS | 运行环境 |
| MySQL | 8.0+ | 数据库 |
| Redis | 7.0+ | 缓存 |
| Nginx | 1.24+ | 反向代理 |
| PM2 | 5.x | 进程管理 |
| Docker | 24.x | 容器化 |

---

## 三、MySQL生产环境配置

### 3.1 安装MySQL 8.0

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装MySQL
sudo apt install mysql-server-8.0 -y

# 启动服务
sudo systemctl start mysql
sudo systemctl enable mysql
```

### 3.2 安全配置

```bash
# 运行安全脚本
sudo mysql_secure_installation

# 配置root密码
# 禁用远程root登录
# 删除匿名用户
# 删除测试数据库
```

### 3.3 性能优化配置

编辑 `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
[mysqld]
# 基础配置
user = mysql
port = 3306
bind-address = 0.0.0.0

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# InnoDB配置
innodb_buffer_pool_size = 4G          # 物理内存的50-70%
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# 连接配置
max_connections = 500
max_connect_errors = 1000
wait_timeout = 600
interactive_timeout = 600

# 查询缓存
query_cache_type = 1
query_cache_size = 256M
query_cache_limit = 8M

# 日志配置
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_error = /var/log/mysql/error.log

# 临时表
tmp_table_size = 128M
max_heap_table_size = 128M
```

### 3.4 数据库初始化

```bash
# 创建数据库和用户
mysql -u root -p

CREATE DATABASE baoyan_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'baoyan_app'@'%' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON baoyan_prod.* TO 'baoyan_app'@'%';
FLUSH PRIVILEGES;
```

### 3.5 备份策略

创建备份脚本 `/opt/backup/mysql_backup.sh`:

```bash
#!/bin/bash
# MySQL备份脚本

BACKUP_DIR="/opt/backup/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="baoyan_prod"
DB_USER="backup_user"
DB_PASS="BackupPassword123!"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
mysqldump -u$DB_USER -p$DB_PASS --single-transaction --routines --triggers $DB_NAME | gzip > $BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz

# 删除7天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# 记录日志
echo "[$(date)] Backup completed: ${DB_NAME}_${DATE}.sql.gz" >> /var/log/mysql/backup.log
```

添加定时任务:
```bash
# 每天凌晨2点备份
0 2 * * * /opt/backup/mysql_backup.sh
```

---

## 四、Redis集群配置

### 4.1 安装Redis

```bash
# 安装Redis
sudo apt install redis-server -y

# 配置Redis
sudo vim /etc/redis/redis.conf
```

### 4.2 集群配置

节点1配置 (`/etc/redis/redis.conf`):

```conf
# 基础配置
port 6379
bind 0.0.0.0
protected-mode no

# 持久化
save 900 1
save 300 10
save 60 10000
rdbcompression yes
rdbchecksum yes

# AOF持久化
appendonly yes
appendfsync everysec

# 内存管理
maxmemory 2gb
maxmemory-policy allkeys-lru

# 集群配置
cluster-enabled yes
cluster-config-file nodes-6379.conf
cluster-node-timeout 5000

# 日志
logfile /var/log/redis/redis-server.log
```

### 4.3 创建集群

```bash
# 在3个节点上分别启动Redis
redis-server /etc/redis/redis.conf

# 创建集群
redis-cli --cluster create \
  192.168.1.101:6379 \
  192.168.1.102:6379 \
  192.168.1.103:6379 \
  --cluster-replicas 0
```

### 4.4 监控配置

```bash
# 安装Redis监控工具
sudo apt install redis-tools -y

# 创建监控脚本
#!/bin/bash
# Redis监控脚本

redis-cli -h localhost info stats | grep -E "(total_connections_received|total_commands_processed)"
redis-cli -h localhost info memory | grep used_memory_human
```

---

## 五、应用部署

### 5.1 环境准备

```bash
# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装PM2
sudo npm install -g pm2

# 创建应用目录
sudo mkdir -p /opt/apps/baoyan
sudo chown -R $USER:$USER /opt/apps/baoyan
```

### 5.2 部署应用

```bash
# 克隆代码
cd /opt/apps/baoyan
git clone https://github.com/your-repo/baoyan.git .
git checkout deployment/production

# 安装依赖
cd backend
npm ci --production

# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 加载种子数据
npx ts-node prisma/seed.ts
```

### 5.3 生产环境配置

创建 `.env.production`:

```env
# 生产环境配置
NODE_ENV=production
PORT=3000

# MySQL数据库
DATABASE_URL="mysql://baoyan_app:StrongPassword123!@mysql-master:3306/baoyan_prod?schema=public"

# Redis集群
REDIS_HOST=redis-cluster
REDIS_PORT=6379
REDIS_PASSWORD=RedisPassword123!
REDIS_DB=0

# JWT配置
JWT_SECRET=YourSuperSecretKeyForProduction2026
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 微信小程序
WECHAT_APPID=wx_your_appid
WECHAT_SECRET=your_secret

# DeepSeek API
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_API_URL=https://api.deepseek.com/v1
DEEPSEEK_DAILY_LIMIT=400

# 限流配置
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# 日志配置
LOG_LEVEL=info
LOG_DIR=/var/log/baoyan
```

### 5.4 PM2配置

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'baoyan-api',
    script: './dist/main.js',
    instances: 'max',  // 使用所有CPU核心
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/baoyan/error.log',
    out_file: '/var/log/baoyan/out.log',
    log_file: '/var/log/baoyan/combined.log',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 3000,
    max_restarts: 5,
    min_uptime: '10s',
    // 健康检查
    health_check_grace_period: 30000,
    health_check_fatal_exceptions: true,
  }],
};
```

### 5.5 启动应用

```bash
# 构建应用
npm run build

# 使用PM2启动
pm2 start ecosystem.config.js --env production

# 保存PM2配置
pm2 save
pm2 startup

# 查看状态
pm2 status
pm2 logs
```

---

## 六、Nginx配置

### 6.1 安装Nginx

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6.2 配置文件

创建 `/etc/nginx/sites-available/baoyan`:

```nginx
upstream baoyan_backend {
    least_conn;
    server 192.168.1.10:3000 weight=5;
    server 192.168.1.11:3000 weight=5;
    keepalive 32;
}

server {
    listen 80;
    server_name api.baoyan.com;
    
    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.baoyan.com;

    # SSL证书
    ssl_certificate /etc/nginx/ssl/baoyan.crt;
    ssl_certificate_key /etc/nginx/ssl/baoyan.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 日志
    access_log /var/log/nginx/baoyan_access.log;
    error_log /var/log/nginx/baoyan_error.log;

    # 客户端限制
    client_max_body_size 10M;
    client_body_buffer_size 128k;

    # 代理设置
    location / {
        proxy_pass http://baoyan_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

启用配置:
```bash
sudo ln -s /etc/nginx/sites-available/baoyan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 七、监控告警

### 7.1 安装Prometheus + Grafana

```bash
# 安装Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
sudo mv prometheus-2.45.0.linux-amd64 /opt/prometheus

# 安装Grafana
sudo apt install -y apt-transport-https software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
sudo apt update
sudo apt install grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

### 7.2 应用监控

安装Node.js监控库:
```bash
npm install prom-client
```

创建监控指标收集:
```typescript
import { Counter, Histogram, register } from 'prom-client';

// HTTP请求计数器
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// 请求延迟直方图
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5],
});
```

### 7.3 告警规则

创建 `/opt/prometheus/alert_rules.yml`:

```yaml
groups:
  - name: baoyan_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowRequests
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow requests detected"
          
      - alert: DatabaseDown
        expr: mysql_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MySQL database is down"
```

---

## 八、部署验证

### 8.1 健康检查

```bash
# 检查应用状态
curl https://api.baoyan.com/health

# 检查API响应
curl https://api.baoyan.com/api/v1/universities?page=1&limit=5

# 检查数据库连接
pm2 logs | grep "数据库连接成功"

# 检查Redis连接
redis-cli -h redis-cluster ping
```

### 8.2 性能测试

```bash
# 使用ab进行压力测试
ab -n 10000 -c 100 https://api.baoyan.com/api/v1/universities

# 使用wrk进行压力测试
wrk -t12 -c400 -d30s https://api.baoyan.com/api/v1/universities
```

### 8.3 监控检查

- [ ] Grafana仪表板正常显示
- [ ] Prometheus数据采集正常
- [ ] 告警规则生效
- [ ] 日志收集正常
- [ ] 备份任务执行正常

---

## 九、回滚方案

### 9.1 应用回滚

```bash
# 查看历史版本
pm2 logs --lines 100

# 回滚到上一个版本
git log --oneline -10
git checkout <commit_hash>
npm run build
pm2 restart baoyan-api
```

### 9.2 数据库回滚

```bash
# 从备份恢复
mysql -u root -p baoyan_prod < backup_20240225_020000.sql
```

---

**部署指南结束**
