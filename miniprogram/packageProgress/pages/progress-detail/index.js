import { progressService } from '../../../services/progress'
import { normalizeAnnouncementType } from '../../../services/announcement'

const PROGRESS_FALLBACK_LIST_KEY = 'progressFallbackList'
const REMINDER_CAMP_IDS_KEY = 'reminderCampIds'
const REMINDER_REFRESH_TOKEN_KEY = 'myRemindersRefreshToken'
const PROGRESS_FOLLOW_REFRESH_TOKEN_KEY = 'progressFollowRefreshToken'

const STATUS_LABELS = {
  followed: '已关注',
  preparing: '准备材料中',
  submitted: '已提交',
  waiting_admission: '待入营名单',
  admitted: '已入营',
  waiting_outstanding: '待优秀营员结果',
  outstanding_published: '优秀营员已发布'
}

const DISPLAY_STAGE_LABELS = {
  followed: '进行中',
  preparing: '进行中',
  submitted: '进行中',
  waiting_admission: '待名单',
  admitted: '待结果',
  waiting_outstanding: '待结果',
  outstanding_published: '已出结果'
}

const DEFAULT_SUBSCRIPTION = {
  enabled: true,
  deadlineChanged: true,
  materialsChanged: true,
  admissionResultChanged: true,
  outstandingResultChanged: true
}

const TIMELINE_STEPS = [
  {
    key: 'followed',
    title: '已关注',
    statuses: ['followed', 'preparing'],
    pendingDesc: '等待开始跟进该公告'
  },
  {
    key: 'submitted',
    title: '已提交材料',
    statuses: ['submitted', 'waiting_admission'],
    pendingDesc: '尚未提交申请材料'
  },
  {
    key: 'admitted',
    title: '已入营/已准入',
    statuses: ['admitted', 'waiting_outstanding'],
    pendingDesc: '等待入营名单结果'
  },
  {
    key: 'outstanding_published',
    title: '已出结果',
    statuses: ['outstanding_published'],
    pendingDesc: '等待最终结果发布'
  }
]

Page({
  data: {
    progressId: '',
    loading: true,
    followRemoving: false,
    progress: null,
    statusLogs: [],
    timelineSteps: [],
    displayTimelineSteps: [],
    timelineExpanded: false,
    timelineHiddenCount: 0,
    timelinePendingCount: 0,
    timelineSummary: '',
    subscription: DEFAULT_SUBSCRIPTION,
    subscriptionExpanded: false,
    subscriptionSummary: '',
    subscriptionSaving: false,
    useFallback: false,
    confirmAction: null
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
      const statusLogs = this.normalizeFallbackStatusLogs(fallback.statusLogs || [])
      const normalizedAnnouncement = normalizeAnnouncementType({
        announcementType: fallback.announcementType || fallback.announcement_type || '',
        announcementTypeLabel: fallback.announcementTypeLabel || fallback.announcement_type_label || '',
        title: fallback.campTitle || ''
      })
      this.setData({
        progress: {
          id: fallback.id,
          campId: fallback.campId || '',
          status: fallback.status,
          stageText: fallback.stageText || this.getDisplayStage(fallback.status),
          nextAction: fallback.nextAction,
          announcementType: normalizedAnnouncement.announcementType,
          announcementTypeLabel: normalizedAnnouncement.announcementTypeLabel,
          camp: {
            title: fallback.campTitle,
            university: { name: fallback.universityName },
            deadline: fallback.deadlineText
          },
          statusLogs
        },
        statusLogs,
        timelineSteps: this.buildTimelineSteps(fallback.status, statusLogs),
        confirmAction: this.getConfirmAction(fallback.status),
        loading: false,
        useFallback: true
      })
      this.refreshDensityViewState()
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
      const [progressDetail, subscriptionResult] = await Promise.all([
        progressService.getProgressDetail(this.data.progressId, {
          showLoading: false,
          showError: false
        }),
        progressService.getSubscription(this.data.progressId, {
          showLoading: false,
          showError: false
        })
      ])

      const progress = this.normalizeProgress(progressDetail)
      const timelineSteps = this.buildTimelineSteps(progress.status, progress.statusLogs || [])
      const subscription = {
        ...DEFAULT_SUBSCRIPTION,
        ...(subscriptionResult || {})
      }

      this.setData({
        progress,
        statusLogs: progress.statusLogs || [],
        timelineSteps,
        confirmAction: this.getConfirmAction(progress.status),
        subscription,
        loading: false,
        useFallback: false
      })
      this.refreshDensityViewState()
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
    const normalizedAnnouncement = normalizeAnnouncementType({
      announcementType: progress.announcementType ||
        progress.announcement_type ||
        progress.camp?.announcementType ||
        progress.camp?.announcement_type ||
        '',
      announcementTypeLabel: progress.announcementTypeLabel ||
        progress.announcement_type_label ||
        progress.camp?.announcementTypeLabel ||
        progress.camp?.announcement_type_label ||
        '',
      title: progress.camp?.title || progress.title || ''
    })

    return {
      ...progress,
      campId: progress.campId || progress.camp?.id || '',
      status,
      stageText: this.getDisplayStage(status),
      announcementType: normalizedAnnouncement.announcementType,
      announcementTypeLabel: normalizedAnnouncement.announcementTypeLabel,
      nextAction: progress.nextAction || this.defaultNextAction(status),
      statusLogs: this.normalizeStatusLogs(progress.statusLogs || [])
    }
  },

  resolveCampId() {
    return String(
      this.data.progress?.campId ||
      this.data.progress?.camp?.id ||
      ''
    )
  },

  syncLocalFollowRemoval(campId, progressId) {
    const normalizedCampId = String(campId || '')
    const normalizedProgressId = String(progressId || this.data.progressId || '')

    const fallbackList = wx.getStorageSync(PROGRESS_FALLBACK_LIST_KEY) || []
    const nextFallbackList = Array.isArray(fallbackList)
      ? fallbackList.filter((item) => {
        const sameProgress = normalizedProgressId && String(item?.id || '') === normalizedProgressId
        const sameCamp = normalizedCampId && String(item?.campId || '') === normalizedCampId
        return !sameProgress && !sameCamp
      })
      : []
    wx.setStorageSync(PROGRESS_FALLBACK_LIST_KEY, nextFallbackList)

    if (normalizedCampId) {
      const reminderCampIds = wx.getStorageSync(REMINDER_CAMP_IDS_KEY) || []
      const nextReminderCampIds = Array.isArray(reminderCampIds)
        ? reminderCampIds.filter((id) => String(id || '') !== normalizedCampId)
        : []
      wx.setStorageSync(REMINDER_CAMP_IDS_KEY, nextReminderCampIds)
    }

    const refreshAt = Date.now()
    wx.setStorageSync(REMINDER_REFRESH_TOKEN_KEY, refreshAt)
    wx.setStorageSync(PROGRESS_FOLLOW_REFRESH_TOKEN_KEY, refreshAt)
  },

  async onCancelFollow() {
    if (this.data.followRemoving) return

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '取消关注',
        content: '取消后将停止该公告的关注与提醒，可后续再次关注。',
        confirmText: '确认取消',
        cancelText: '继续关注',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return

    const progressId = this.data.progressId
    const campId = this.resolveCampId()

    this.setData({ followRemoving: true })
    wx.showLoading({ title: '处理中...' })

    try {
      if (!this.data.useFallback) {
        if (progressId) {
          try {
            await progressService.removeProgress(progressId, {
              showLoading: false,
              showError: false
            })
          } catch (error) {
            if (campId) {
              await progressService.unfollowCamp(campId, {
                showLoading: false,
                showError: false
              })
            } else {
              throw error
            }
          }
        } else if (campId) {
          await progressService.unfollowCamp(campId, {
            showLoading: false,
            showError: false
          })
        } else {
          throw new Error('缺少公告信息')
        }
      }

      this.syncLocalFollowRemoval(campId, progressId)
      wx.showToast({ title: '已取消关注', icon: 'success' })
      setTimeout(() => {
        if (getCurrentPages().length > 1) {
          wx.navigateBack()
        } else {
          wx.reLaunch({
            url: '/packageProgress/pages/progress-list/index'
          })
        }
      }, 200)
    } catch (error) {
      wx.showToast({ title: '取消关注失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ followRemoving: false })
    }
  },

  getConfirmAction(status) {
    if (status === 'followed' || status === 'preparing') {
      return { status: 'submitted', label: '确认已提交材料' }
    }
    if (status === 'submitted' || status === 'waiting_admission') {
      return { status: 'admitted', label: '确认已入营' }
    }
    if (status === 'admitted' || status === 'waiting_outstanding') {
      return { status: 'outstanding_published', label: '确认结果已发布' }
    }
    return null
  },

  normalizeFallbackStatusLogs(logs = []) {
    return this.normalizeStatusLogs(logs.map((log, index) => ({
      ...log,
      id: log.id || `fallback-log-${index}`,
      changedAt: log.changedAt || log.changedAtText || ''
    })))
  },

  normalizeStatusLogs(logs = []) {
    return logs
      .map(log => ({
        ...log,
        fromStatusText: log.fromStatus ? STATUS_LABELS[log.fromStatus] || log.fromStatus : '初始',
        toStatusText: STATUS_LABELS[log.toStatus] || log.toStatus || '未知',
        changedAtText: log.changedAtText || this.formatDateTime(log.changedAt),
        changedAtTs: this.toTimestamp(log.changedAt || log.changedAtText)
      }))
      .sort((a, b) => (a.changedAtTs || 0) - (b.changedAtTs || 0))
  },

  getDisplayStage(status) {
    return DISPLAY_STAGE_LABELS[status] || '进行中'
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

  toTimestamp(value) {
    if (!value) return 0
    const date = new Date(value)
    const ts = date.getTime()
    return Number.isNaN(ts) ? 0 : ts
  },

  resolveTimelineIndex(status) {
    const index = TIMELINE_STEPS.findIndex(step => step.statuses.includes(status))
    return index > -1 ? index : 0
  },

  buildSubscriptionSummary(subscription = DEFAULT_SUBSCRIPTION) {
    const total = 4
    if (!subscription.enabled) {
      return '总开关已关闭'
    }
    let enabledCount = 0
    if (subscription.deadlineChanged) enabledCount += 1
    if (subscription.materialsChanged) enabledCount += 1
    if (subscription.admissionResultChanged) enabledCount += 1
    if (subscription.outstandingResultChanged) enabledCount += 1
    return `${enabledCount}/${total} 项已开启`
  },

  buildTimelineSummary(timelineSteps = []) {
    if (!Array.isArray(timelineSteps) || timelineSteps.length === 0) {
      return '暂无进展记录'
    }
    const doneCount = timelineSteps.filter(item => item.state === 'done').length
    const currentCount = timelineSteps.filter(item => item.state === 'current').length
    if (currentCount > 0 && doneCount > 0) {
      return `已完成 ${doneCount} 项，当前 1 项`
    }
    if (currentCount > 0) {
      return '当前进行中'
    }
    if (doneCount > 0) {
      return `已完成 ${doneCount} 项`
    }
    return `共 ${timelineSteps.length} 个阶段`
  },

  buildDisplayTimelineSteps(timelineSteps = [], expanded = false) {
    if (!Array.isArray(timelineSteps)) return []
    if (expanded) {
      return [...timelineSteps]
    }
    const compact = timelineSteps.filter(item => item.state !== 'pending')
    return compact.length > 0 ? compact : timelineSteps.slice(0, 1)
  },

  refreshDensityViewState() {
    const timelineSteps = this.data.timelineSteps || []
    const timelineExpanded = Boolean(this.data.timelineExpanded)
    const displayTimelineSteps = this.buildDisplayTimelineSteps(timelineSteps, timelineExpanded)
    const pendingCount = timelineSteps.filter(item => item.state === 'pending').length
    this.setData({
      displayTimelineSteps,
      timelineHiddenCount: Math.max(0, timelineSteps.length - displayTimelineSteps.length),
      timelinePendingCount: pendingCount,
      timelineSummary: this.buildTimelineSummary(timelineSteps),
      subscriptionSummary: this.buildSubscriptionSummary(this.data.subscription)
    })
  },

  onToggleSubscriptionExpanded() {
    this.setData({
      subscriptionExpanded: !this.data.subscriptionExpanded
    })
  },

  onToggleTimelineExpanded() {
    const timelineExpanded = !this.data.timelineExpanded
    this.setData({
      timelineExpanded,
      displayTimelineSteps: this.buildDisplayTimelineSteps(this.data.timelineSteps || [], timelineExpanded)
    })
  },

  buildTimelineSteps(currentStatus, statusLogs = []) {
    const currentIndex = this.resolveTimelineIndex(currentStatus)
    const logsByStatus = {}
    statusLogs.forEach(log => {
      if (!log?.toStatus) return
      if (!logsByStatus[log.toStatus]) {
        logsByStatus[log.toStatus] = log
      }
    })

    return TIMELINE_STEPS.map((step, index) => {
      const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
      const statusText = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '未开始'
      const matchedLog = step.statuses
        .map(status => logsByStatus[status])
        .find(Boolean)
      const timeText = matchedLog?.changedAtText || '--'
      const desc = matchedLog?.note ||
        (state === 'current'
          ? `当前状态：${STATUS_LABELS[currentStatus] || currentStatus || '进行中'}`
          : step.pendingDesc)

      return {
        key: step.key,
        title: step.title,
        state,
        statusText,
        timeText,
        desc
      }
    })
  },

  async onSubscriptionChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    if (!key) return

    if (this.data.subscriptionSaving) {
      return
    }

    if (this.data.useFallback) {
      wx.showToast({ title: '离线模式下不可更新', icon: 'none' })
      return
    }

    const previousSubscription = {
      ...this.data.subscription
    }
    const patchData = {
      [key]: value
    }
    const nextSubscription = {
      ...previousSubscription,
      [key]: value
    }

    if (key !== 'enabled' && value && !nextSubscription.enabled) {
      nextSubscription.enabled = true
      patchData.enabled = true
    }

    this.setData({
      subscription: nextSubscription,
      subscriptionSaving: true,
      subscriptionSummary: this.buildSubscriptionSummary(nextSubscription)
    })
    try {
      await progressService.updateSubscription(this.data.progressId, patchData, {
        showLoading: false,
        showError: false
      })
      this.setData({
        subscriptionSaving: false,
        subscriptionSummary: this.buildSubscriptionSummary(nextSubscription)
      })
    } catch (error) {
      this.setData({
        subscription: previousSubscription,
        subscriptionSaving: false,
        subscriptionSummary: this.buildSubscriptionSummary(previousSubscription)
      })
      wx.showToast({ title: '更新失败，已恢复', icon: 'none' })
    }
  },

  async onConfirmNextStep() {
    if (this.data.useFallback) {
      wx.showToast({ title: '离线模式下不可更新', icon: 'none' })
      return
    }
    const action = this.data.confirmAction
    if (!action || !action.status) return

    wx.showLoading({ title: '确认中...' })
    try {
      await progressService.confirmProgressStep(this.data.progressId, {
        status: action.status
      }, {
        showLoading: false
      })
      wx.showToast({ title: '已确认', icon: 'success' })
      this.loadData()
    } catch (error) {
      wx.showToast({ title: '确认失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
