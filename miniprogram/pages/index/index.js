// 首页 v0.2 - AI 助理今日新机会
import { assistantService } from '../../services/assistant'
import { profileV2Service } from '../../services/profile-v2'
import { subscriptionService } from '../../services/subscription'

const RECOMMENDATION_MAP = {
  recommend: { icon: '🟢', text: '推荐', cls: 'match-recommendation-success' },
  reference: { icon: '🟡', text: '可参考', cls: 'match-recommendation-warning' },
  skip: { icon: '⚪', text: '可跳过', cls: 'match-recommendation-skip' }
}

const REQ_ICON_MAP = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  unknown: '?'
}

Page({
  data: {
    loading: false,
    hasProfile: false,
    hasSubscription: false,
    activeTab: 'undecided', // undecided | interested
    opportunities: [],
    stats: {
      undecidedCount: 0,
      interestedCount: 0,
      appliedCount: 0,
      recommendCount: 0
    },
    emptyStateText: '今天没有新机会，明天再来看看'
  },

  onLoad() {
    this.refresh()
  },

  onShow() {
    // 从子页面返回时刷新
    if (this.data.hasProfile) {
      this.refresh()
    }
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      // 并行拉取档案 + 订阅状态 + 机会列表
      const [profileResp, schoolsResp] = await Promise.all([
        profileV2Service.get().catch(() => null),
        subscriptionService.listSchools().catch(() => null)
      ])

      const hasProfile = !!profileResp?.exists
      const hasSubscription = (schoolsResp?.totalSubscribed || 0) > 0

      this.setData({ hasProfile, hasSubscription })

      if (hasSubscription) {
        await this.loadOpportunities()
      } else {
        this.setData({ opportunities: [] })
      }
    } catch (err) {
      // 静默失败
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadOpportunities() {
    const action = this.data.activeTab
    try {
      const resp = await assistantService.getOpportunities({ action, limit: 30 })
      const list = (resp?.data || []).map(this.normalizeOpportunity)

      // 统计
      const [undecidedResp, interestedResp, appliedResp] = await Promise.all([
        assistantService.getOpportunities({ action: 'undecided', limit: 1 }).catch(() => ({ total: 0 })),
        assistantService.getOpportunities({ action: 'interested', limit: 1 }).catch(() => ({ total: 0 })),
        assistantService.getOpportunities({ action: 'applied', limit: 1 }).catch(() => ({ total: 0 }))
      ])

      const recommendCount = list.filter(x => x.overallRecommendation === 'recommend').length

      this.setData({
        opportunities: list,
        stats: {
          undecidedCount: undecidedResp.total || 0,
          interestedCount: interestedResp.total || 0,
          appliedCount: appliedResp.total || 0,
          recommendCount
        },
        emptyStateText: action === 'interested'
          ? '还没有收藏的机会，发现感兴趣的点"感兴趣"即可'
          : '今天没有新机会，明天再来看看'
      })
    } catch (err) {
      this.setData({ opportunities: [] })
    }
  },

  normalizeOpportunity(raw) {
    const rec = RECOMMENDATION_MAP[raw.overallRecommendation] || RECOMMENDATION_MAP.reference
    const allReqs = Array.isArray(raw.keyRequirements) ? raw.keyRequirements : []
    const preview = allReqs.slice(0, 3).map(r => ({
      requirement: r.requirement,
      userMatch: r.userMatch,
      icon: REQ_ICON_MAP[r.userMatch] || '?'
    }))

    return {
      ...raw,
      recommendationIcon: rec.icon,
      recommendationText: rec.text,
      recommendationClass: rec.cls,
      keyRequirementsPreview: preview,
      keyRequirementsMore: Math.max(0, allReqs.length - 3),
      deadlineText: this.formatDeadline(raw.extractedDeadline)
    }
  },

  formatDeadline(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const now = Date.now()
    const diff = d.getTime() - now
    const days = Math.ceil(diff / 86400000)
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`
    if (days < 0) return `已过期（${dateStr}）`
    if (days === 0) return `今日截止 ${dateStr}`
    if (days <= 3) return `${dateStr} · 剩 ${days} 天 🔥`
    return `${dateStr} · 剩 ${days} 天`
  },

  // ============ 交互 ============

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab }, () => this.loadOpportunities())
  },

  onTapStat(e) {
    const action = e.currentTarget.dataset.action
    this.setData({ activeTab: action === 'applied' ? 'interested' : action }, () => this.loadOpportunities())
  },

  onTapMatch(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/packageAssistant/pages/match-detail/index?id=${id}` })
  },

  async onActionInterested(e) {
    const id = e.currentTarget.dataset.id
    try {
      await assistantService.updateAction(id, 'interested')
      wx.showToast({ title: '已收藏', icon: 'success' })
      this.loadOpportunities()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async onActionSkip(e) {
    const id = e.currentTarget.dataset.id
    try {
      await assistantService.updateAction(id, 'skipped')
      this.loadOpportunities()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  noop() {},

  // ============ 导航 ============

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
