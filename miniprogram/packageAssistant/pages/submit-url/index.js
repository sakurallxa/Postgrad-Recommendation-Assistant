import { assistantService } from '../../../services/assistant'

Page({
  data: {
    url: '',
    hintTitle: '',
    loading: false
  },

  onInputUrl(e) {
    this.setData({ url: (e.detail.value || '').trim() })
  },
  onInputHint(e) {
    this.setData({ hintTitle: e.detail.value })
  },

  async onSubmit() {
    let { url, hintTitle } = this.data
    if (!url || !/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '请输入有效的 URL', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await assistantService.submitUrl(url, hintTitle || undefined)
      if (result?.matchId) {
        wx.redirectTo({
          url: `/packageAssistant/pages/match-detail/index?id=${result.matchId}`
        })
      } else {
        wx.showToast({ title: '分析失败，请重试', icon: 'none' })
      }
    } catch (err) {
      wx.showModal({
        title: '分析失败',
        content: err?.message || '请检查 URL 后重试',
        showCancel: false
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})
