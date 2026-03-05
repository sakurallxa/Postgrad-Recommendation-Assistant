import { progressService } from '../../../services/progress'

Page({
  data: {
    loading: true,
    success: false,
    message: '正在处理，请稍候...',
    progressId: ''
  },

  onLoad(options) {
    const token = String(options?.token || '').trim()
    if (!token) {
      this.setData({
        loading: false,
        success: false,
        message: '确认链接缺少 token，请返回通知中心重试。'
      })
      return
    }
    this.consumeToken(token)
  },

  async consumeToken(token) {
    this.setData({ loading: true })
    try {
      const result = await progressService.consumeActionToken({ token }, {
        showLoading: false,
        showError: false
      })

      if (result?.consumed) {
        const statusLabel = this.getStatusLabel(result.currentStatus || result.targetStatus)
        this.setData({
          loading: false,
          success: true,
          message: `已确认并更新到「${statusLabel}」。`,
          progressId: result.progressId || ''
        })
        return
      }

      if (result?.alreadyHandled) {
        this.setData({
          loading: false,
          success: true,
          message: '该确认已处理，无需重复操作。',
          progressId: result.progressId || ''
        })
        return
      }

      this.setData({
        loading: false,
        success: false,
        message: '确认失败，请返回通知中心手动处理。'
      })
    } catch (error) {
      this.setData({
        loading: false,
        success: false,
        message: error?.message || '确认失败，请稍后再试。'
      })
    }
  },

  getStatusLabel(status) {
    const map = {
      followed: '已关注',
      preparing: '准备材料中',
      submitted: '已提交',
      waiting_admission: '待入营名单',
      admitted: '已入营',
      waiting_outstanding: '待优秀营员结果',
      outstanding_published: '优秀营员已发布'
    }
    return map[status] || status || '已更新'
  },

  onOpenProgressDetail() {
    const progressId = String(this.data.progressId || '')
    if (!progressId) {
      this.onOpenReminder()
      return
    }
    wx.redirectTo({
      url: `/packageProgress/pages/progress-detail/index?id=${progressId}`
    })
  },

  onOpenReminder() {
    wx.switchTab({
      url: '/pages/my-reminders/index'
    })
  }
})
