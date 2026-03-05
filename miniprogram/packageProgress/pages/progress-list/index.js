import { progressService } from '../../../services/progress'

const STAGE_MAP = {
  followed: '进行中',
  preparing: '进行中',
  submitted: '进行中',
  waiting_admission: '待名单',
  admitted: '待结果',
  waiting_outstanding: '待结果',
  outstanding_published: '已出结果'
}

Page({
  data: {
    centerTabs: [
      { label: '风险提醒', value: 'risk' },
      { label: '关注进展', value: 'progress' }
    ],
    activeCenterTab: 'progress',
    progressList: [],
    loading: false,
    useFallback: false,
    usingMockData: false
  },

  onLoad() {
    this.setData({ activeCenterTab: 'progress' })
    this.loadData()
  },

  onShow() {
    if (this.data.activeCenterTab !== 'progress') {
      this.setData({ activeCenterTab: 'progress' })
    }
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

  getEnvVersion() {
    try {
      return wx.getAccountInfoSync().miniProgram.envVersion || 'release'
    } catch (error) {
      return 'release'
    }
  },

  shouldInjectMockFallback() {
    return this.getEnvVersion() !== 'release'
  },

  buildMockFallbackList() {
    const now = Date.now()
    return [
      {
        id: 'mock-progress-fudan-1',
        status: 'waiting_admission',
        stageText: STAGE_MAP.waiting_admission,
        nextAction: '每天检查是否有名单更新',
        campId: 'mock-camp-fudan-1',
        campTitle: 'AI研究院2026年预推免通知',
        universityName: '复旦大学',
        deadlineText: '2026-03-12',
        updatedAtText: '2026-03-02 21:45',
        subscriptionEnabled: true,
        announcementType: 'pre_recommendation',
        announcementTypeLabel: '预推免公告',
        statusLogs: [
          {
            id: 'mock-log-fudan-1',
            fromStatus: null,
            toStatus: 'followed',
            changedAt: new Date(now - 6 * 24 * 3600 * 1000).toISOString(),
            note: '已关注该公告'
          },
          {
            id: 'mock-log-fudan-2',
            fromStatus: 'followed',
            toStatus: 'preparing',
            changedAt: new Date(now - 4 * 24 * 3600 * 1000).toISOString(),
            note: '开始整理报名材料'
          },
          {
            id: 'mock-log-fudan-3',
            fromStatus: 'preparing',
            toStatus: 'submitted',
            changedAt: new Date(now - 2 * 24 * 3600 * 1000).toISOString(),
            note: '已提交基础材料'
          },
          {
            id: 'mock-log-fudan-4',
            fromStatus: 'submitted',
            toStatus: 'waiting_admission',
            changedAt: new Date(now - 18 * 3600 * 1000).toISOString(),
            note: '进入待名单阶段'
          }
        ]
      },
      {
        id: 'mock-progress-tsinghua-1',
        status: 'waiting_outstanding',
        stageText: STAGE_MAP.waiting_outstanding,
        nextAction: '关注优秀营员结果发布',
        campId: 'mock-camp-tsinghua-1',
        campTitle: '计算机学院2026年优秀大学生夏令营',
        universityName: '清华大学',
        deadlineText: '2026-03-18',
        updatedAtText: '2026-03-02 20:10',
        subscriptionEnabled: true,
        announcementType: 'summer_camp',
        announcementTypeLabel: '夏令营公告',
        statusLogs: [
          {
            id: 'mock-log-tsinghua-1',
            fromStatus: null,
            toStatus: 'followed',
            changedAt: new Date(now - 10 * 24 * 3600 * 1000).toISOString(),
            note: '已关注该公告'
          },
          {
            id: 'mock-log-tsinghua-2',
            fromStatus: 'followed',
            toStatus: 'submitted',
            changedAt: new Date(now - 7 * 24 * 3600 * 1000).toISOString(),
            note: '材料已提交'
          },
          {
            id: 'mock-log-tsinghua-3',
            fromStatus: 'submitted',
            toStatus: 'admitted',
            changedAt: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
            note: '已收到入营通知'
          },
          {
            id: 'mock-log-tsinghua-4',
            fromStatus: 'admitted',
            toStatus: 'waiting_outstanding',
            changedAt: new Date(now - 12 * 3600 * 1000).toISOString(),
            note: '等待优秀营员结果'
          }
        ]
      }
    ]
  },

  loadFallbackData() {
    let fallbackList = wx.getStorageSync('progressFallbackList') || []
    let usingMockData = false

    if ((!Array.isArray(fallbackList) || fallbackList.length === 0) && this.shouldInjectMockFallback()) {
      fallbackList = this.buildMockFallbackList()
      usingMockData = true
      wx.setStorageSync('progressFallbackList', fallbackList)
    }

    if (!Array.isArray(fallbackList)) fallbackList = []
    fallbackList = fallbackList.map(item => ({
      ...item,
      stageText: item.stageText || STAGE_MAP[item.status] || '进行中'
    }))

    this.setData({
      progressList: fallbackList,
      loading: false,
      useFallback: true,
      usingMockData
    })
  },

  async loadData() {
    this.setData({ loading: true })

    if (this.shouldInjectMockFallback() && wx.getStorageSync('progressUseMockData') === true) {
      this.loadFallbackData()
      return
    }

    if (!this.shouldUseRemoteProgressApi()) {
      this.loadFallbackData()
      return
    }

    try {
      const progressResult = await progressService.getProgressList({
        page: 1,
        limit: 50
      }, {
        showLoading: false,
        showError: false
      })

      const progressList = (progressResult.data || []).map(item => this.formatProgress(item))

      this.setData({
        progressList,
        loading: false,
        useFallback: false,
        usingMockData: false
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
      stageText: STAGE_MAP[item.status] || '进行中',
      nextAction: item.nextAction || this.defaultNextAction(item.status),
      campId: item.campId,
      campTitle: item.camp?.title || '未命名项目',
      universityName: item.camp?.university?.name || '未知院校',
      deadlineText,
      updatedAtText: this.formatDateTime(item.updatedAt),
      subscriptionEnabled: item.subscription?.enabled !== false
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
  },

  onOpenSchoolSubscription() {
    wx.navigateTo({
      url: '/packageProgress/pages/school-subscription/index'
    })
  },

  onCenterTabTap(e) {
    const tab = e?.currentTarget?.dataset?.value
    if (!tab || tab === this.data.activeCenterTab) return
    if (tab === 'risk') {
      wx.switchTab({
        url: '/pages/my-reminders/index'
      })
      return
    }
    this.setData({ activeCenterTab: 'progress' })
  }
})
