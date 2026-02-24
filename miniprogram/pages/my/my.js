// 个人中心页面逻辑
Page({
  data: {
    userInfo: {
      nickname: '',
      avatar: '',
      openid: ''
    },
    isLoggedIn: false
  },

  onLoad() {
    // 初始化页面
    this.checkLoginStatus()
  },

  onShow() {
    // 页面显示时检查登录状态
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    const token = wx.getStorageSync('token')
    
    if (userInfo && token) {
      this.setData({
        userInfo: userInfo,
        isLoggedIn: true
      })
    } else {
      this.setData({
        userInfo: {
          nickname: '',
          avatar: '',
          openid: ''
        },
        isLoggedIn: false
      })
    }
  },

  // 处理微信登录
  handleLogin() {
    wx.showLoading({ title: '登录中...' })
    
    // 调用微信登录API
    wx.login({
      success: (res) => {
        if (res.code) {
          // 模拟登录成功
          this.mockLogin(res.code)
        } else {
          wx.hideLoading()
          wx.showToast({ title: '登录失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        wx.showToast({ title: '登录失败', icon: 'none' })
        console.error('登录失败:', err)
      }
    })
  },

  // 模拟登录成功
  mockLogin(code) {
    setTimeout(() => {
      const mockUserInfo = {
        nickname: '保研er',
        avatar: 'https://example.com/avatar/default.png',
        openid: 'mock_openid_' + Date.now()
      }
      const mockToken = 'mock_token_' + Date.now()
      
      // 存储用户信息和token
      wx.setStorageSync('userInfo', mockUserInfo)
      wx.setStorageSync('token', mockToken)
      
      this.setData({
        userInfo: mockUserInfo,
        isLoggedIn: true
      })
      
      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })
    }, 1000)
  },

  // 跳转到目标院校管理
  navigateToSelector() {
    wx.navigateTo({
      url: '/packageSelector/pages/selector/index'
    })
  },

  // 跳转到我的提醒
  navigateToReminders() {
    wx.navigateTo({
      url: '/packageReminder/pages/my-reminders/index'
    })
  },

  // 处理意见反馈
  handleFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '请将您的建议或问题发送至：baoyan@example.com',
      showCancel: false,
      confirmText: '确定'
    })
  },

  // 处理关于我们
  handleAbout() {
    wx.showModal({
      title: '关于我们',
      content: '保研信息助手 v1.0.0\n\n专注于为保研学生提供目标院校夏令营信息的精准聚合与截止日期智能提醒服务。\n\n让保研学生不再错过任何一个夏令营报名截止日期。',
      showCancel: false,
      confirmText: '确定'
    })
  }
})