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
    const isLegacyInvalidDomain = typeof savedApiBaseUrl === 'string' && (
      savedApiBaseUrl.indexOf('api.baoyan.com') > -1 ||
      savedApiBaseUrl.indexOf('tcb.qcloud.la') > -1 ||
      savedApiBaseUrl.indexOf('localhost') > -1 ||
      savedApiBaseUrl.indexOf('127.0.0.1') > -1
    )

    let resolvedApiBaseUrl
    if (USE_LOCAL_BACKEND) {
      resolvedApiBaseUrl = LOCAL_BACKEND_URL
      try { wx.setStorageSync('apiBaseUrl', LOCAL_BACKEND_URL) } catch (e) {}
      console.log('[环境] 使用本地后端:', LOCAL_BACKEND_URL)
    } else {
      // 生产模式：如果本地缓存的是 localhost/旧域名，强制覆盖为生产域名
      if (isLegacyInvalidDomain || !savedApiBaseUrl) {
        resolvedApiBaseUrl = PROD_BACKEND_URL
        try { wx.setStorageSync('apiBaseUrl', PROD_BACKEND_URL) } catch (e) {}
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
