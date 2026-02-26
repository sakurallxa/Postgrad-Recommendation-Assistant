# 后续行动清单 - 未完成工作项执行指南

**审查日期**: 2026-02-25  
**审查人**: AI Assistant  
**报告状态**: 待执行  

---

## 执行摘要

根据对《后续行动清单执行报告》的全面审查，识别出**5项未完成工作**，按优先级排序如下：

| 优先级 | 任务 | 状态 | 预计耗时 | 截止时间 |
|--------|------|------|----------|----------|
| P0 | 数据库迁移执行 | ⏳ 待执行 | 10分钟 | 2026-02-25 18:00 |
| P0 | 前端JWT Token适配 | ⏳ 待执行 | 2小时 | 2026-02-25 20:00 |
| P1 | 测试环境验证 | ⏳ 待执行 | 1.5小时 | 2026-02-25 21:00 |
| P1 | 性能验证 | ⏳ 待执行 | 30分钟 | 2026-02-25 23:00 |
| P2 | 风险监控与回滚准备 | ⏳ 待执行 | 持续进行 | - |

---

## 任务1: 数据库迁移执行 (P0)

### 1.1 任务目标
在数据库中创建Reminder表的复合索引，优化查询性能。

### 1.2 所需资源
- Node.js 环境 (v16+)
- npm 或 yarn
- 数据库访问权限
- Prisma CLI

### 1.3 操作步骤

#### 步骤1: 环境准备
```bash
# 确认Node.js已安装
node -v  # 应显示 v16.x.x 或更高
npm -v   # 应显示 8.x.x 或更高

# 进入项目目录
cd /Users/lusansui/Documents/trae_build_project/project_baoyan/backend

# 安装依赖（如未安装）
npm install
```

#### 步骤2: 备份数据库
```bash
# 备份SQLite数据库
cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# 或备份MySQL数据库
mysqldump -u username -p database_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### 步骤3: 执行迁移
```bash
# 方式A: 使用Prisma迁移（推荐）
npx prisma migrate dev --name add_reminder_indexes

# 生成Prisma客户端
npx prisma generate
```

#### 步骤4: 验证迁移（如Prisma迁移失败，使用手动SQL）
```bash
# 进入数据库命令行
npx prisma studio

# 或使用SQLite命令行
sqlite3 prisma/dev.db

# 执行SQL创建索引
CREATE INDEX IF NOT EXISTS "reminders_userId_createdAt_idx" ON "reminders"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "reminders_userId_status_idx" ON "reminders"("userId", "status");
```

### 1.4 预期成果
- ✅ 数据库中成功创建两个索引
- ✅ Prisma客户端正常生成
- ✅ 应用启动无报错

### 1.5 质量检查标准
```bash
# 验证索引创建成功
# SQLite
sqlite3 prisma/dev.db ".indexes reminders"

# 预期输出:
# reminders_userId_createdAt_idx
# reminders_userId_status_idx

# MySQL
SHOW INDEX FROM reminders;

# 预期输出包含:
# - Key_name: idx_reminders_userId_createdAt
# - Key_name: idx_reminders_userId_status
```

### 1.6 时间节点
- **开始时间**: 立即
- **完成时间**: 开始后10分钟内
- **截止时间**: 2026-02-25 18:00

### 1.7 风险应对
| 风险 | 应对措施 |
|------|----------|
| 迁移失败 | 使用手动SQL方案 |
| 数据损坏 | 提前备份，可回滚 |
| 权限不足 | 联系DBA协助 |

---

## 任务2: 前端JWT Token适配 (P0)

### 2.1 任务目标
修改前端所有调用提醒相关接口的请求，添加JWT Token认证头。

### 2.2 所需资源
- 前端开发环境
- 微信小程序开发者工具
- 后端API文档
- 测试账号

### 2.3 操作步骤

#### 步骤1: 创建请求封装工具
创建/修改文件: `miniprogram/utils/request.js`

```javascript
// 获取存储的Token
const getToken = () => {
  return wx.getStorageSync('access_token');
};

// 封装请求函数
const request = (options) => {
  const token = getToken();
  
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      header: {
        ...options.header,
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode === 401) {
          // Token过期，跳转到登录页
          wx.navigateTo({ url: '/pages/login/login' });
          reject(new Error('Token expired'));
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data.message || 'Request failed'));
        }
      },
      fail: reject
    });
  });
};

// 提醒API封装
const reminderAPI = {
  getReminders: (page = 1, limit = 20, status) => {
    const params = { page, limit };
    if (status) params.status = status;
    
    return request({
      url: '/api/v1/reminders',
      method: 'GET',
      data: params
    });
  },
  
  createReminder: (data) => {
    return request({
      url: '/api/v1/reminders',
      method: 'POST',
      data
    });
  },
  
  deleteReminder: (id) => {
    return request({
      url: `/api/v1/reminders/${id}`,
      method: 'DELETE'
    });
  }
};

module.exports = { request, reminderAPI };
```

#### 步骤2: 更新提醒列表页面
修改文件: `miniprogram/pages/reminders/reminders.js`

```javascript
const { reminderAPI } = require('../../utils/request');

Page({
  data: {
    reminders: [],
    page: 1,
    limit: 20,
    status: '',
    loading: false,
    hasMore: true
  },

  onLoad() {
    this.loadReminders();
  },

  async loadReminders() {
    if (this.data.loading || !this.data.hasMore) return;
    
    this.setData({ loading: true });
    
    try {
      const result = await reminderAPI.getReminders(
        this.data.page,
        this.data.limit,
        this.data.status
      );
      
      this.setData({
        reminders: [...this.data.reminders, ...result.data],
        page: this.data.page + 1,
        hasMore: result.data.length === this.data.limit,
        loading: false
      });
    } catch (error) {
      console.error('加载提醒失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 状态筛选
  filterByStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      status,
      reminders: [],
      page: 1,
      hasMore: true
    });
    this.loadReminders();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ reminders: [], page: 1, hasMore: true });
    this.loadReminders().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadReminders();
  }
});
```

#### 步骤3: 更新登录逻辑
修改文件: `miniprogram/pages/login/login.js`

```javascript
const { request } = require('../../utils/request');

Page({
  async handleLogin() {
    try {
      // 获取微信登录code
      const { code } = await wx.login();
      
      // 调用后端登录接口
      const result = await request({
        url: '/api/v1/auth/wx-login',
        method: 'POST',
        data: { code }
      });
      
      // 存储Token
      wx.setStorageSync('access_token', result.access_token);
      wx.setStorageSync('refresh_token', result.refresh_token);
      
      // 跳转到首页
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) {
      console.error('登录失败:', error);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  }
});
```

#### 步骤4: 全局搜索检查
```bash
# 在项目目录中搜索所有wx.request调用
grep -r "wx.request" miniprogram/pages/ --include="*.js"

# 确保所有API调用都使用封装后的request函数
# 需要修改的文件列表：
# - 所有调用提醒接口的页面
# - 所有需要认证的API调用
```

### 2.4 预期成果
- ✅ 所有提醒相关接口调用都携带JWT Token
- ✅ Token过期时自动跳转到登录页
- ✅ 401错误被正确拦截处理
- ✅ 代码通过代码审查

### 2.5 质量检查标准
```javascript
// 检查清单
// 1. 确认每个API请求都包含Authorization头
// 2. 确认401错误被正确处理
// 3. 确认Token存储和读取正常
// 4. 确认页面能正常获取数据
```

### 2.6 时间节点
- **开始时间**: 数据库迁移完成后
- **完成时间**: 开始后2小时内
- **截止时间**: 2026-02-25 20:00

### 2.7 风险应对
| 风险 | 应对措施 |
|------|----------|
| 遗漏API调用 | 全局搜索wx.request，逐一检查 |
| Token处理不一致 | 统一使用request封装函数 |
| 测试覆盖不足 | 编写单元测试覆盖所有场景 |

---

## 任务3: 测试环境验证 (P1)

### 3.1 任务目标
验证数据库迁移、JWT认证、接口功能、前端适配的正确性。

### 3.2 所需资源
- Postman 或 curl
- 微信小程序开发者工具
- 测试数据
- 测试账号

### 3.3 操作步骤

#### 步骤1: 数据库验证
```bash
# 验证索引创建
sqlite3 prisma/dev.db ".indexes reminders"

# 验证数据完整性
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM reminders;"
```

#### 步骤2: 接口测试（使用curl）
```bash
# 测试1: 未携带Token（应返回401）
curl -X GET http://localhost:3000/api/v1/reminders
# 预期: HTTP 401 Unauthorized

# 测试2: 携带有效Token（应返回200）
curl -X GET http://localhost:3000/api/v1/reminders \
  -H "Authorization: Bearer YOUR_TOKEN"
# 预期: HTTP 200 OK，返回当前用户的提醒列表

# 测试3: 状态筛选
curl -X GET "http://localhost:3000/api/v1/reminders?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 测试4: 分页
curl -X GET "http://localhost:3000/api/v1/reminders?page=2&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 测试5: 数据隔离验证
curl -X GET http://localhost:3000/api/v1/reminders \
  -H "Authorization: Bearer USER_A_TOKEN"
# 确认只返回用户A的数据
```

#### 步骤3: 前端功能测试
- [ ] 小程序能正常获取提醒列表
- [ ] Token过期时自动跳转到登录页
- [ ] 状态筛选功能正常工作
- [ ] 分页加载功能正常工作
- [ ] 创建/删除提醒功能正常

#### 步骤4: 编写测试报告
记录所有测试结果，包括：
- 通过的测试项
- 失败的测试项及原因
- 发现的bug列表
- 修复建议

### 3.4 预期成果
- ✅ 所有测试用例通过
- ✅ 无P0/P1级别bug
- ✅ 测试报告已生成

### 3.5 质量检查标准
| 检查项 | 标准 |
|--------|------|
| 接口响应时间 | < 500ms |
| 数据准确性 | 100%准确 |
| 功能覆盖率 | 100%覆盖 |
| Bug修复率 | P0/P1: 100% |

### 3.6 时间节点
- **开始时间**: 前端适配完成后
- **完成时间**: 开始后1.5小时内
- **截止时间**: 2026-02-25 21:00

---

## 任务4: 性能验证 (P1)

### 4.1 任务目标
验证Reminder接口性能是否达到预期（响应时间<500ms）。

### 4.2 所需资源
- 1000条以上测试数据
- 性能测试工具（curl、ab、或Postman）
- 监控工具

### 4.3 操作步骤

#### 步骤1: 准备测试数据
```bash
# 使用Prisma Seed或SQL插入测试数据
# 确保reminders表有1000条以上数据
```

#### 步骤2: 执行性能测试
```bash
# 测试查询性能
time curl -X GET http://localhost:3000/api/v1/reminders \
  -H "Authorization: Bearer YOUR_TOKEN"

# 多次测试取平均值
for i in {1..10}; do
  time curl -s -X GET http://localhost:3000/api/v1/reminders \
    -H "Authorization: Bearer YOUR_TOKEN" > /dev/null
done
```

#### 步骤3: 分析结果
- 记录平均响应时间
- 记录最大响应时间
- 确认是否<500ms

### 4.4 预期成果
- ✅ 平均响应时间 < 500ms
- ✅ 95%请求响应时间 < 800ms
- ✅ 无超时错误

### 4.5 质量检查标准
| 指标 | 目标值 | 警告值 | 危险值 |
|------|--------|--------|--------|
| 平均响应时间 | <300ms | 300-500ms | >500ms |
| P95响应时间 | <500ms | 500-800ms | >800ms |
| 错误率 | 0% | <1% | >1% |

### 4.6 时间节点
- **开始时间**: 功能测试完成后
- **完成时间**: 开始后30分钟内
- **截止时间**: 2026-02-25 23:00

### 4.7 优化方案（如未达标）
如性能未达标，执行以下优化：
1. 添加Redis缓存
2. 优化数据库查询
3. 添加数据库连接池

---

## 任务5: 风险监控与回滚准备 (P2)

### 5.1 任务目标
建立监控机制，准备回滚方案，确保系统稳定性。

### 5.2 所需资源
- 监控工具（日志系统、APM）
- 数据库备份
- Git仓库访问权限

### 5.3 操作步骤

#### 步骤1: 准备回滚脚本
```bash
#!/bin/bash
# rollback.sh

echo "开始回滚..."

# 数据库回滚
sqlite3 prisma/dev.db "DROP INDEX IF EXISTS reminders_userId_createdAt_idx;"
sqlite3 prisma/dev.db "DROP INDEX IF EXISTS reminders_userId_status_idx;"

# 代码回滚
git revert 715acb0 --no-edit
git revert 51a9f01 --no-edit
git push origin main

echo "回滚完成"
```

#### 步骤2: 配置监控
- 设置接口响应时间监控
- 设置错误率监控
- 设置数据库性能监控

#### 步骤3: 建立告警机制
- 响应时间>500ms时告警
- 错误率>1%时告警
- 数据库连接池耗尽时告警

### 5.4 预期成果
- ✅ 回滚脚本已准备并测试
- ✅ 监控系统已配置
- ✅ 告警机制已启用

### 5.5 质量检查标准
- 回滚脚本可正常执行
- 监控系统无漏报
- 告警通知及时送达

### 5.6 时间节点
- **开始时间**: 与任务1并行
- **完成时间**: 上线前
- **持续时间**: 持续监控

---

## 执行时间表汇总

| 时间 | 任务 | 负责人 | 产出物 |
|------|------|--------|--------|
| T+0 | 数据库迁移 | 后端开发 | 迁移成功确认 |
| T+10min | 前端JWT适配 | 前端开发 | 代码提交 |
| T+2h10min | 测试环境验证 | 测试人员 | 测试报告 |
| T+3h40min | 性能验证 | 测试人员 | 性能报告 |
| 持续 | 风险监控 | 运维人员 | 监控告警 |

**总预计耗时**: 约4小时  
**最终截止时间**: 2026-02-25 23:00

---

## 联系人与升级路径

| 问题级别 | 联系人 | 响应时间 |
|----------|--------|----------|
| P0-系统不可用 | 技术负责人 | 15分钟 |
| P1-功能缺陷 | 开发负责人 | 1小时 |
| P2-性能问题 | 运维负责人 | 4小时 |
| P3-优化建议 | 产品经理 | 24小时 |

---

**文档版本**: v1.0  
**最后更新**: 2026-02-25  
**下次审查**: 所有任务完成后
