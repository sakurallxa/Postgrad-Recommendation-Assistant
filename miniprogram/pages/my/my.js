// 个人中心 v0.2 - 简化菜单
import { profileV2Service } from '../../services/profile-v2'
import { subscriptionService } from '../../services/subscription'

Page({
  data: {
    userName: '保研er',
    avatarInitial: '保',
    profile: {
      exists: false,
      completeness: 0
    },
    subscribedCount: 0
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      const [profile, schools] = await Promise.all([
        profileV2Service.get().catch(() => ({ exists: false })),
        subscriptionService.listSchools().catch(() => ({ totalSubscribed: 0 }))
      ])
      const subscribedCount = schools?.totalSubscribed || 0
      const name = profile?.schoolName ? `${profile.major || ''}学子` : '保研er'
      this.setData({
        profile: {
          exists: profile?.exists || false,
          completeness: profile?.completeness || 0
        },
        subscribedCount,
        userName: name,
        avatarInitial: (profile?.major || '保')[0]
      })
    } catch (err) {
      // ignore
    }
  },

  goProfile() {
    wx.navigateTo({ url: '/packageAssistant/pages/profile-edit/index' })
  },
  goSelector() {
    wx.navigateTo({ url: '/packageAssistant/pages/dept-selector/index' })
  },
  goSubmitUrl() {
    wx.navigateTo({ url: '/packageAssistant/pages/submit-url/index' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？订阅和收藏数据保留在云端，下次登录可继续。',
      confirmText: '退出',
      confirmColor: '#d94343',
      success: (res) => {
        if (!res.confirm) return
        try {
          wx.removeStorageSync('token')
          wx.removeStorageSync('accessToken')
          wx.removeStorageSync('refreshToken')
          wx.removeStorageSync('activeCrawlJobId')
          wx.removeStorageSync('userSelectionDepartments')
          const app = getApp()
          if (app && app.globalData) {
            app.globalData.token = ''
            app.globalData.isLoggedIn = false
            app.globalData.userInfo = null
          }
        } catch (e) {}
        wx.showToast({ title: '已退出登录', icon: 'success', duration: 1000 })
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' })
        }, 1000)
      }
    })
  }
})
