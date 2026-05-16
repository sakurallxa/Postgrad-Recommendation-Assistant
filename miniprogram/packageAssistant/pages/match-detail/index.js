import { assistantService } from '../../../services/assistant'
import { requestDeadlineQuota } from '../../../services/subscribe-message'

const REC_MAP = {
  recommend: { icon: '🟢', text: 'AI 推荐你申请', cls: 'match-recommendation-success' },
  reference: { icon: '🟡', text: '可以参考', cls: 'match-recommendation-warning' },
  skip: { icon: '⚪', text: '建议跳过', cls: 'match-recommendation-skip' }
}
const REQ_ICONS = { pass: '✓', warn: '!', fail: '✕', unknown: '?' }

Page({
  data: {
    loading: true,
    match: null,
    recommendationIcon: '',
    recommendationText: '',
    recommendationClass: '',
    deadlineText: '',
    campPeriodText: '',
    requirementIcons: REQ_ICONS
  },

  onLoad(options) {
    this.matchId = options.id
    this.load()
  },

  async load() {
    if (!this.matchId) {
      wx.showToast({ title: '缺少 ID', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      const match = await assistantService.getMatchDetail(this.matchId)
      const rec = REC_MAP[match.overallRecommendation] || REC_MAP.reference
      this.setData({
        match,
        recommendationIcon: rec.icon,
        recommendationText: rec.text,
        recommendationClass: rec.cls,
        deadlineText: this.formatDate(match.extractedDeadline, true),
        campPeriodText: this.formatPeriod(match.extractedStartDate, match.extractedEndDate)
      })
    } catch (err) {
      wx.showToast({ title: err?.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  formatDate(iso, withCountdown = false) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const m = d.getMonth() + 1
    const day = d.getDate()
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const base = `${m}月${day}日 ${h}:${min}`
    if (!withCountdown) return base
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    if (days < 0) return `${base}（已过期）`
    if (days === 0) return `${base}（今日截止）`
    return `${base}（剩 ${days} 天）`
  },

  formatPeriod(start, end) {
    if (!start && !end) return ''
    const s = start ? this.formatDate(start) : ''
    const e = end ? this.formatDate(end) : ''
    return [s, e].filter(Boolean).join(' — ')
  },

  // 校徽加载失败 → 降级为首字母 placeholder
  onLogoError() {
    if (this.data.match?.camp?.universityLogo) {
      this.setData({ 'match.camp.universityLogo': null })
    }
  },

  // 点击"查看 ›" → 跳到 web-view 页内嵌打开
  // 若域名未加白名单，web-view 会触发 binderror，子页里会自动切到 fallback 视图
  onViewSource() {
    const url = this.data.match?.camp?.sourceUrl
    if (!url) return
    wx.navigateTo({
      url: `/packageAssistant/pages/source-webview/index?url=${encodeURIComponent(url)}`,
      fail: () => {
        // 兜底：跳转失败就回到复制逻辑
        wx.setClipboardData({
          data: url,
          success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
        })
      }
    })
  },

  // 点击"复制" → 仅复制 URL，让用户自行去浏览器打开
  onCopyLink() {
    const url = this.data.match?.camp?.sourceUrl
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，可粘贴到浏览器打开', icon: 'none', duration: 2000 })
    })
  },

  /**
   * 收藏 / 取消收藏 toggle 入口
   * - 当前 userAction === 'interested' → 取消收藏（action='reset'）
   * - 否则 → 弹微信订阅消息授权 → 设为 interested
   */
  async onBookmark() {
    const cur = this.data.match?.userAction
    if (cur === 'interested') {
      return this.uncollect()
    }
    return this.collect()
  },

  async collect() {
    // 必须由用户手势直接触发 wx.requestSubscribeMessage
    let userRejected = false
    try {
      const quota = await requestDeadlineQuota()
      userRejected = !!quota.userRejected
    } catch (e) {
      console.warn('[match-detail] requestDeadlineQuota 异常', e)
    }
    // 用户在弹窗里点了"取消" → 整个收藏动作中止（符合用户对"取消"的直觉）
    // 如果想收藏但不要微信提醒，可以走首页"轻收藏"
    if (userRejected) {
      return
    }
    try {
      await assistantService.updateAction(this.matchId, 'interested')
      this.setData({ 'match.userAction': 'interested' })
      // toast 用 success icon（不透明、视觉稳）+ 短文案
      wx.showToast({ title: '已收藏', icon: 'success', duration: 1500 })
    } catch (err) {
      wx.showToast({ title: '收藏失败，请重试', icon: 'none' })
    }
  },

  async uncollect() {
    wx.showModal({
      title: '取消收藏',
      content: '取消后将不再收到截止提醒，确定吗？',
      confirmText: '取消收藏',
      confirmColor: '#d94343',
      success: async (res) => {
        if (!res.confirm) return
        try {
          // 后端 reset 会同时清掉 userAction + 关联的 Reminder 记录
          await assistantService.updateAction(this.matchId, 'reset')
          this.setData({ 'match.userAction': null })
          wx.showToast({ title: '已取消收藏', icon: 'success', duration: 1200 })
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // "我已申请"按钮 toggle —— 走独立的 isApplied 字段，不动 userAction（收藏态）
  async onApplied() {
    const isApplied = !!this.data.match?.isApplied
    const nextAction = isApplied ? 'unapplied' : 'applied'
    try {
      await assistantService.updateAction(this.matchId, nextAction)
      this.setData({ 'match.isApplied': !isApplied })
      wx.showToast({
        title: isApplied ? '已取消标记' : '已标记为已申请',
        icon: 'success',
        duration: 1000
      })
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async updateAction(action, msg) {
    try {
      await assistantService.updateAction(this.matchId, action)
      wx.showToast({ title: msg, icon: 'success' })
      this.setData({ 'match.userAction': action })
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
