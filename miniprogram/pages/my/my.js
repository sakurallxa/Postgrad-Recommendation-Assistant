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
  }
})
