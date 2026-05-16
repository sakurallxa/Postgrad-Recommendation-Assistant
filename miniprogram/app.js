// app.js
App({
  onLaunch() {
    // 初始化全局数据
    this.initGlobalData()

    // 检查登录状态（仅恢复已有 token，登录由 http.js 懒加载触发）
    this.checkLoginStatus()

    // 初始化MobX store
    this.initStores()
  },
  
  onShow() {
    // 应用从后台进入前台时执行
  },
  
  onHide() {
    // 应用进入后台时执行
  },
  
  onError(error) {
    console.error('App error:', error)
  },
  
  initGlobalData() {
    // ============ 环境切换开关 ============
    // 本地预览：true  → http://localhost:3000/api/v1
    // 发布生产：false → https://baoyanwang-helper.cn/api/v1
    // ⚠️ 上线前务必改为 false
    const USE_LOCAL_BACKEND = false
    const LOCAL_BACKEND_URL = 'http://localhost:3000/api/v1'
    const PROD_BACKEND_URL = 'https://baoyanwang-helper.cn/api/v1'
    // ====================================

    const savedApiBaseUrl = wx.getStorageSync('apiBaseUrl')
    // 任何不等于当前期望值的缓存 baseUrl，都视为脏数据：
    // 1) 历史遗留域名（api.baoyan.com / tcb.qcloud.la）
    // 2) 本地开发地址（localhost / 127.0.0.1）
    // 3) 缺 /api/v1 前缀的裸域名（之前的 bug，会导致 login 404）
    // 4) 任何不等于当前期望 PROD_BACKEND_URL 的值（防御性兜底）
    const expectedUrl = USE_LOCAL_BACKEND ? LOCAL_BACKEND_URL : PROD_BACKEND_URL
    const isDirtyCache = typeof savedApiBaseUrl !== 'string' ||
      !savedApiBaseUrl ||
      savedApiBaseUrl.indexOf('api.baoyan.com') > -1 ||
      savedApiBaseUrl.indexOf('tcb.qcloud.la') > -1 ||
      savedApiBaseUrl.indexOf('localhost') > -1 ||
      savedApiBaseUrl.indexOf('127.0.0.1') > -1 ||
      savedApiBaseUrl.indexOf('/api/v1') === -1 ||
      savedApiBaseUrl !== expectedUrl

    let resolvedApiBaseUrl
    if (USE_LOCAL_BACKEND) {
      resolvedApiBaseUrl = LOCAL_BACKEND_URL
      try { wx.setStorageSync('apiBaseUrl', LOCAL_BACKEND_URL) } catch (e) {}
      console.log('[环境] 使用本地后端:', LOCAL_BACKEND_URL)
    } else {
      // 生产模式：缓存值跟期望值不一致就强制覆盖
      if (isDirtyCache) {
        resolvedApiBaseUrl = PROD_BACKEND_URL
        try { wx.setStorageSync('apiBaseUrl', PROD_BACKEND_URL) } catch (e) {}
        if (savedApiBaseUrl) {
          console.warn('[环境] 检测到脏缓存 baseUrl，已覆盖:', savedApiBaseUrl, '→', PROD_BACKEND_URL)
        }
      } else {
        resolvedApiBaseUrl = savedApiBaseUrl
      }
    }

    this.globalData = {
      userInfo: null,
      token: '',
      isLoggedIn: false,
      apiBaseUrl: resolvedApiBaseUrl,
      isLocalDev: USE_LOCAL_BACKEND,
      // 微信订阅消息：截止前 7/5/3 天提醒模板 ID
      // 必须与 backend .env 的 WX_SUBSCRIBE_TEMPLATE_ID 一致
      // 当前：「报名时间提醒」(11005) — 字段 thing9 活动名称 / time7 截止时间 / thing3 温馨提示
      wxSubscribeTemplateId: '379sA5oXwz0SlTwtmuk8Sz9sO4gx5bq9rUpwHPf31QI'
    }
  },
  
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.globalData.isLoggedIn = true
    }
  },

  
  initStores() {
    // 延迟加载store，避免包体积过大
    if (!this.stores) {
      this.stores = {
        user: null,
        camp: null,
        reminder: null,
        selection: null
      }
    }
  },
  
  getStore(storeName) {
    if (!this.stores[storeName]) {
      // 按需加载store
      try {
        switch (storeName) {
          case 'user':
            this.stores.user = require('./store/user').userStore
            break
          case 'camp':
            this.stores.camp = require('./store/camp').campStore
            break
          case 'reminder':
            this.stores.reminder = require('./store/reminder').reminderStore
            break
          case 'selection':
            this.stores.selection = require('./store/selection').selectionStore
            break
        }
      } catch (error) {
        console.error('Load store error:', error)
      }
    }
    return this.stores[storeName]
  },
  
  globalData: {}
})
