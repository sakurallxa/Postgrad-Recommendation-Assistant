// app.js
App({
  onLaunch() {
    // 初始化全局数据
    this.initGlobalData()
    
    // 检查登录状态
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
    const savedApiBaseUrl = wx.getStorageSync('apiBaseUrl')
    const isLegacyInvalidDomain = typeof savedApiBaseUrl === 'string' && savedApiBaseUrl.indexOf('api.baoyan.com') > -1
    const resolvedApiBaseUrl = (!savedApiBaseUrl || isLegacyInvalidDomain)
      ? 'https://7072-prod-3gtxp94je7bc33d7-1407249275.tcb.qcloud.la/v1'
      : savedApiBaseUrl
    this.globalData = {
      userInfo: null,
      token: '',
      isLoggedIn: false,
      // 默认使用已在开发者工具配置的合法域名，可通过 wx.setStorageSync('apiBaseUrl', '...') 覆盖
      apiBaseUrl: resolvedApiBaseUrl
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
