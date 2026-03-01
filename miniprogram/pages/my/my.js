// 个人中心页面逻辑
import { userStore } from '../../store/user'
import { authService } from '../../services/auth'

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
    if (userStore.isLoggedIn && userStore.userInfo) {
      this.setData({
        userInfo: userStore.userInfo,
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
  async handleLogin() {
    wx.showLoading({ title: '登录中...' })
    
    try {
      // 调用微信登录API
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (loginRes.code) {
        // 调用登录服务
        const loginData = await authService.login(loginRes.code)
        
        // 更新状态管理
        userStore.setUserInfo(loginData.userInfo)
        userStore.setToken(loginData.token)
        
        this.setData({
          userInfo: loginData.userInfo,
          isLoggedIn: true
        })
        
        wx.showToast({ title: '登录成功', icon: 'success' })
      } else {
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    } catch (error) {
      console.error('登录失败:', error)
      wx.showToast({ title: '登录失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 跳转到目标院校管理
  navigateToSelector() {
    wx.navigateTo({
      url: '/packageSelector/pages/selector/index'
    })
  },

  // 跳转到我的提醒
  navigateToReminders() {
    wx.switchTab({
      url: '/pages/my-reminders/index'
    })
  },

  // 跳转到申请进展中心
  navigateToProgress() {
    wx.navigateTo({
      url: '/packageProgress/pages/progress-list/index'
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
      content: '保研信息助手 v1.0.0\n\n专注于为保研学生提供目标院校夏令营/预推免信息的精准聚合与截止日期智能提醒服务。\n\n让保研学生不再错过任何一个夏令营/预推免报名截止日期。',
      showCancel: false,
      confirmText: '确定'
    })
  },

  // 处理退出登录
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除状态管理
          userStore.logout()
          
          // 更新页面状态
          this.setData({
            userInfo: {
              nickname: '',
              avatar: '',
              openid: ''
            },
            isLoggedIn: false
          })
          
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
