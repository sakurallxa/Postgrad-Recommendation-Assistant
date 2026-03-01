import { progressService } from '../../../services/progress'

const STATUS_MAP = {
  followed: '已关注',
  preparing: '准备材料中',
  submitted: '已提交',
  waiting_admission: '待入营名单',
  admitted: '已入营',
  waiting_outstanding: '待优秀营员结果',
  outstanding_published: '优秀营员已发布'
}

Page({
  data: {
    statusOptions: [
      { label: '全部', value: 'all' },
      { label: '准备中', value: 'preparing' },
      { label: '待名单', value: 'waiting_admission' },
      { label: '待结果', value: 'waiting_outstanding' }
    ],
    activeStatus: 'all',
    progressList: [],
    alertList: [],
    loading: false,
    useFallback: false
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (!this.data.loading) {
      this.loadData()
    }
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

  loadFallbackData() {
    const fallbackList = wx.getStorageSync('progressFallbackList') || []
    this.setData({
      progressList: fallbackList,
      alertList: [],
      loading: false,
      useFallback: true
    })
  },

  async loadData() {
    this.setData({ loading: true })

    if (!this.shouldUseRemoteProgressApi()) {
      this.loadFallbackData()
      return
    }

    try {
      const [progressResult, alertResult] = await Promise.all([
        progressService.getProgressList({
          page: 1,
          limit: 50,
          status: this.data.activeStatus
        }, {
          showLoading: false,
          showError: false
        }),
        progressService.getAlerts({
          page: 1,
          limit: 20,
          status: 'pending'
        }, {
          showLoading: false,
          showError: false
        })
      ])

      const progressList = (progressResult.data || []).map(item => this.formatProgress(item))
      const alertList = (alertResult.data || []).map(item => this.formatAlert(item))

      this.setData({
        progressList,
        alertList,
        loading: false,
        useFallback: false
      })
      wx.setStorageSync('progressFallbackList', progressList)
    } catch (error) {
      this.loadFallbackData()
    }
  },

  formatProgress(item) {
    const deadlineText = this.formatDate(item.camp?.deadline)
    return {
      id: item.id,
      status: item.status,
      statusText: STATUS_MAP[item.status] || item.status,
      nextAction: item.nextAction || this.defaultNextAction(item.status),
      campId: item.campId,
      campTitle: item.camp?.title || '未命名项目',
      universityName: item.camp?.university?.name || '未知院校',
      deadlineText,
      updatedAtText: this.formatDateTime(item.updatedAt),
      subscriptionEnabled: item.subscription?.enabled !== false
    }
  },

  formatAlert(item) {
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type,
      confidenceLabel: item.confidenceLabel || item.event?.confidenceLabel || '',
      scheduledAtText: this.formatDateTime(item.scheduledAt)
    }
  },

  defaultNextAction(status) {
    const map = {
      followed: '先整理材料并确认报名入口',
      preparing: '检查材料完整性并准备提交',
      submitted: '关注入营名单发布时间',
      waiting_admission: '每天检查是否有名单更新',
      admitted: '准备营期安排并跟进后续通知',
      waiting_outstanding: '关注优秀营员结果发布',
      outstanding_published: '记录结果并准备下一步申请'
    }
    return map[status] || '持续关注项目进展'
  },

  formatDate(value) {
    if (!value) return '待定'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '待定'
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${d}`
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

  onFilterTap(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ activeStatus: status }, () => this.loadData())
  },

  onOpenProgressDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageProgress/pages/progress-detail/index?id=${id}`
    })
  },

  onOpenCampList() {
    wx.navigateTo({
      url: '/packageCamp/pages/camp-list/index'
    })
  }
})
