import { progressService } from '../../../services/progress'

const STATUS_LABELS = {
  followed: '已关注',
  preparing: '准备材料中',
  submitted: '已提交',
  waiting_admission: '待入营名单',
  admitted: '已入营',
  waiting_outstanding: '待优秀营员结果',
  outstanding_published: '优秀营员已发布'
}

const NEXT_STATUS_OPTIONS = {
  followed: ['preparing', 'submitted'],
  preparing: ['followed', 'submitted'],
  submitted: ['waiting_admission', 'admitted'],
  waiting_admission: ['submitted', 'admitted'],
  admitted: ['waiting_outstanding'],
  waiting_outstanding: ['admitted', 'outstanding_published'],
  outstanding_published: ['waiting_outstanding']
}

Page({
  data: {
    progressId: '',
    loading: true,
    progress: null,
    statusLogs: [],
    nextStatusOptions: [],
    subscription: {
      enabled: true,
      deadlineChanged: true,
      materialsChanged: true,
      admissionResultChanged: true,
      outstandingResultChanged: true
    },
    alerts: [],
    useFallback: false
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '缺少进展ID', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    this.setData({ progressId: options.id })
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  shouldUseRemoteProgressApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteProgressApi')
    if (forceRemote === true) return true
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  loadFallbackDetail() {
    const fallback = (wx.getStorageSync('progressFallbackList') || []).find(
      item => item.id === this.data.progressId
    )
    if (fallback) {
      this.setData({
        progress: {
          id: fallback.id,
          status: fallback.status,
          statusText: fallback.statusText,
          nextAction: fallback.nextAction,
          camp: {
            title: fallback.campTitle,
            university: { name: fallback.universityName },
            deadline: fallback.deadlineText
          },
          statusLogs: []
        },
        nextStatusOptions: this.getNextStatusOptions(fallback.status),
        statusLogs: [],
        alerts: [],
        loading: false,
        useFallback: true
      })
      return true
    }
    return false
  },

  async loadData() {
    this.setData({ loading: true })

    if (!this.shouldUseRemoteProgressApi()) {
      const loaded = this.loadFallbackDetail()
      if (!loaded) {
        this.setData({ loading: false })
        wx.showToast({ title: '暂无本地进展数据', icon: 'none' })
      }
      return
    }

    try {
      const [progressDetail, subscriptionResult, alertsResult] = await Promise.all([
        progressService.getProgressDetail(this.data.progressId, {
          showLoading: false,
          showError: false
        }),
        progressService.getSubscription(this.data.progressId, {
          showLoading: false,
          showError: false
        }),
        progressService.getAlerts({ page: 1, limit: 50, status: 'pending' }, {
          showLoading: false,
          showError: false
        })
      ])

      const progress = this.normalizeProgress(progressDetail)
      const alerts = (alertsResult.data || [])
        .filter(item => item.progressId === this.data.progressId)
        .map(item => this.normalizeAlert(item))

      this.setData({
        progress,
        statusLogs: progress.statusLogs || [],
        nextStatusOptions: this.getNextStatusOptions(progress.status),
        subscription: subscriptionResult || this.data.subscription,
        alerts,
        loading: false,
        useFallback: false
      })
    } catch (error) {
      const loaded = this.loadFallbackDetail()
      if (!loaded) {
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    }
  },

  normalizeProgress(progress) {
    const status = progress.status || 'followed'
    return {
      ...progress,
      status,
      statusText: STATUS_LABELS[status] || status,
      nextAction: progress.nextAction || this.defaultNextAction(status),
      statusLogs: (progress.statusLogs || []).map(log => ({
        ...log,
        fromStatusText: log.fromStatus ? STATUS_LABELS[log.fromStatus] || log.fromStatus : '初始',
        toStatusText: STATUS_LABELS[log.toStatus] || log.toStatus,
        changedAtText: this.formatDateTime(log.changedAt)
      }))
    }
  },

  normalizeAlert(item) {
    return {
      ...item,
      scheduledAtText: this.formatDateTime(item.scheduledAt),
      confidenceLabel: item.confidenceLabel || item.event?.confidenceLabel || ''
    }
  },

  defaultNextAction(status) {
    const map = {
      followed: '开始整理报名材料',
      preparing: '确认提交材料完整且规范',
      submitted: '关注入营名单发布',
      waiting_admission: '每日检查结果更新',
      admitted: '准备营期和后续环节',
      waiting_outstanding: '关注优秀营员结果',
      outstanding_published: '记录结果并规划下一步'
    }
    return map[status] || '持续跟进'
  },

  getNextStatusOptions(status) {
    return (NEXT_STATUS_OPTIONS[status] || []).map(value => ({
      value,
      label: STATUS_LABELS[value] || value
    }))
  },

  formatDateTime(value) {
    if (!value) return '未知'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '未知'
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    const h = `${date.getHours()}`.padStart(2, '0')
    const min = `${date.getMinutes()}`.padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  },

  async onSwitchStatus(e) {
    const status = e.currentTarget.dataset.status
    if (this.data.useFallback) {
      wx.showToast({ title: '离线模式下不可更新', icon: 'none' })
      return
    }
    wx.showLoading({ title: '更新中...' })
    try {
      await progressService.updateProgressStatus(this.data.progressId, { status }, {
        showLoading: false
      })
      await this.loadData()
      wx.showToast({ title: '状态已更新', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onSubscriptionChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({
      subscription: {
        ...this.data.subscription,
        [key]: value
      }
    })
  },

  async onSaveSubscription() {
    if (this.data.useFallback) {
      wx.showToast({ title: '离线模式下不可更新', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      await progressService.updateSubscription(this.data.progressId, this.data.subscription, {
        showLoading: false
      })
      wx.showToast({ title: '订阅已更新', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onHandleAlert(e) {
    if (this.data.useFallback) return
    const alertId = e.currentTarget.dataset.id
    try {
      await progressService.handleAlert(alertId, {
        showLoading: false
      })
      await this.loadData()
      wx.showToast({ title: '已处理', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async onSnoozeAlert(e) {
    if (this.data.useFallback) return
    const alertId = e.currentTarget.dataset.id
    try {
      await progressService.snoozeAlert(alertId, { hours: 24 }, {
        showLoading: false
      })
      await this.loadData()
      wx.showToast({ title: '已延后24小时', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
