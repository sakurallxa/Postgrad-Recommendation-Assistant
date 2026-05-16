// 个人中心 v0.2 - 简化菜单 + 登录态管理
import { http } from '../../services/http'
import { profileV2Service } from '../../services/profile-v2'
import { subscriptionService } from '../../services/subscription'

Page({
  data: {
    isLoggedIn: false,
    loginPending: false,        // 登录请求进行中
    userName: '未登录',
    avatarInitial: '?',
    profile: { exists: false, completeness: 0 },
    subscribedCount: 0
  },

  onShow() {
    this.syncAuthFromStorage()
  },

  /**
   * 唯一的状态入口：从存储读取登录态 → 写入 data → 已登录则异步拉档案
   * 任何状态变化（登录成功、退出登录、onShow）都必须调用本函数
   */
  syncAuthFromStorage() {
    const token = wx.getStorageSync('token')
    const disabled = wx.getStorageSync('disableAutoLogin')
    const loggedIn = !!token && !disabled
    console.log('[my] syncAuthFromStorage', { hasToken: !!token, disabled: !!disabled, loggedIn })

    if (!loggedIn) {
      this.setData({
        isLoggedIn: false,
        userName: '未登录',
        avatarInitial: '?',
        profile: { exists: false, completeness: 0 },
        subscribedCount: 0
      })
      return
    }

    // 已登录：先乐观切到已登录视图，再异步拉档案/订阅
    this.setData({
      isLoggedIn: true,
      userName: '保研er',
      avatarInitial: '保'
    })
    this.loadUserData()
  },

  async loadUserData() {
    try {
      const [profile, schools] = await Promise.all([
        profileV2Service.get().catch((e) => { console.warn('[my] profile fetch failed', e?.message); return { exists: false } }),
        subscriptionService.listSchools().catch((e) => { console.warn('[my] schools fetch failed', e?.message); return { totalSubscribed: 0 } })
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
      console.warn('[my] loadUserData failed', err)
    }
  },

  ensureLoggedInOrPrompt(then) {
    if (this.data.isLoggedIn) { then && then(); return }
    wx.showModal({
      title: '需要先登录',
      content: '登录后才能保存档案、订阅院系、查看抓取结果。',
      confirmText: '微信登录',
      cancelText: '稍后再说',
      success: (res) => { if (res.confirm) this.onLogin() }
    })
  },

  goProfile() {
    this.ensureLoggedInOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/profile-edit/index' })
    )
  },
  goSelector() {
    this.ensureLoggedInOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/dept-selector/index' })
    )
  },
  goSubmitUrl() {
    this.ensureLoggedInOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/submit-url/index' })
    )
  },

  async onLogin() {
    if (this.data.loginPending) return
    console.log('[my] onLogin start')
    this.setData({ loginPending: true })
    try {
      const token = await http.login()
      console.log('[my] http.login resolved, token length=', token?.length || 0)
      if (!token) {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        return
      }
      // 立即根据存储重新计算 UI 状态（http.login 内部已写入 token）
      this.syncAuthFromStorage()
      wx.showToast({ title: '登录成功', icon: 'success', duration: 1200 })
    } catch (e) {
      console.error('[my] onLogin error', e)
      wx.showToast({
        title: e?.message ? `登录失败：${e.message}` : '登录失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ loginPending: false })
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？订阅和收藏数据保留在云端，下次登录可继续。',
      confirmText: '退出',
      confirmColor: '#d94343',
      success: (res) => {
        if (!res.confirm) return
        console.log('[my] onLogout')
        http.logout()
        this.syncAuthFromStorage()
        wx.showToast({ title: '已退出登录', icon: 'success', duration: 1000 })
      }
    })
  }
})
