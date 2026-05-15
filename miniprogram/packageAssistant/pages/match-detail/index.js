import { assistantService } from '../../../services/assistant'

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

  onCopySource() {
    const url = this.data.match?.camp?.sourceUrl
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    })
  },

  async onBookmark() {
    await this.updateAction('interested', '已收藏 · 截止前会提醒你')
  },

  async onApplied() {
    await this.updateAction('applied', '已标记为已申请')
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
