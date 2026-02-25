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
    this.globalData = {
      userInfo: null,
      token: '',
      isLoggedIn: false,
      apiBaseUrl: 'https://api.baoyan.com/v1'
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