// 我的提醒页（行动视角）
import { reminderService } from '../../services/reminder'
import { normalizeAnnouncementType } from '../../services/announcement'
import { campService } from '../../services/camp'
import { progressService } from '../../services/progress'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const HANDLED_MAP_KEY = 'reminderHandledMap'
const REMINDER_REFRESH_TOKEN_KEY = 'myRemindersRefreshToken'
const RICH_MOCK_REMINDERS_KEY = 'enableRichReminderMock'
const REMINDER_CAMP_SNAPSHOT_MAP_KEY = 'reminderCampSnapshotMap'
const PROGRESS_FALLBACK_LIST_KEY = 'progressFallbackList'
const PROGRESS_USE_MOCK_KEY = 'progressUseMockData'
const NOTIFICATION_CENTER_ACTIVE_TAB_KEY = 'notificationCenterActiveTab'

const PROGRESS_STAGE_MAP = {
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
    activeCenterTab: 'risk',
    summary: {
      todayDueSchools: 0,
      threeDaysDueSchools: 0,
      changedSchools: 0
    },
    viewModes: [
      { label: '按学校看', value: 'school' },
      { label: '按通知看', value: 'task' }
    ],
    selectedViewMode: 'school',
    schoolFilterOptions: [{ label: '全部学校', value: 'all' }],
    selectedSchoolFilter: 'all',
    schoolFilterHint: '',
    focusFilters: [
      { label: '全部', value: 'all' },
      { label: '今日优先', value: 'today' },
      { label: '3天内关注', value: 'three_days' },
      { label: '信息有变更', value: 'changed' },
      { label: '已查看', value: 'handled' }
    ],
    selectedFocusFilter: 'today',
    focusFilterHint: '',
    reminders: [],
    progressOverviewList: [],
    progressLoading: false,
    progressUseFallback: false,
    progressUsingMockData: false,
    taskSections: [],
    groupedSchools: [],
    schoolExpandMap: {},
    schoolViewFilterMap: {},
    loading: false,
    initialized: false,
    lastRefreshToken: 0,
    handledMap: {},
    emptyState: {
      title: '暂无保研通知',
      desc: '在夏令营/预推免详情页设置提醒后会出现在这里'
    }
  },

  onLoad() {
    this.loadHandledMap()
  },

  onShow() {
    const targetTab = wx.getStorageSync(NOTIFICATION_CENTER_ACTIVE_TAB_KEY)
    if (targetTab === 'risk' || targetTab === 'progress') {
      this.setData({ activeCenterTab: targetTab })
      wx.removeStorageSync(NOTIFICATION_CENTER_ACTIVE_TAB_KEY)
    }

    const refreshToken = Number(wx.getStorageSync(REMINDER_REFRESH_TOKEN_KEY) || 0)

    if (!this.data.initialized) {
      this.setData({
        initialized: true,
        lastRefreshToken: refreshToken
      })
      this.loadReminders({ preserveOnEmpty: true })
      if (this.data.activeCenterTab === 'progress') {
        this.loadProgressOverview()
      }
      return
    }

    if (refreshToken > this.data.lastRefreshToken) {
      this.setData({ lastRefreshToken: refreshToken })
      this.loadReminders({ preserveOnEmpty: true })
    }
    if (this.data.activeCenterTab === 'progress') {
      this.loadProgressOverview()
    }
  },

  onCenterTabTap(e) {
    const tab = e?.currentTarget?.dataset?.value
    if (!tab || tab === this.data.activeCenterTab) return
    if (tab === 'progress') {
      this.setData({ activeCenterTab: 'progress' })
      this.loadProgressOverview()
      return
    }
    this.setData({ activeCenterTab: 'risk' })
  },

  async loadProgressOverview() {
    if (this.data.progressLoading) return
    this.setData({ progressLoading: true })

    if (!this.shouldUseRemoteProgressApi()) {
      this.loadProgressFallbackData()
      return
    }

    try {
      const result = await progressService.getProgressList({
        page: 1,
        limit: 50
      }, {
        showLoading: false,
        showError: false
      })
      const progressOverviewList = (result?.data || []).map(item => this.normalizeProgressItem(item))
      this.setData({
        progressOverviewList,
        progressLoading: false,
        progressUseFallback: false,
        progressUsingMockData: false
      })
      wx.setStorageSync(PROGRESS_FALLBACK_LIST_KEY, progressOverviewList)
    } catch (error) {
      this.loadProgressFallbackData()
    }
  },

  loadProgressFallbackData() {
    let fallbackList = wx.getStorageSync(PROGRESS_FALLBACK_LIST_KEY) || []
    let progressUsingMockData = false

    if ((!Array.isArray(fallbackList) || fallbackList.length === 0) && this.shouldInjectProgressMockData()) {
      fallbackList = this.buildProgressMockFallbackList()
      progressUsingMockData = true
      wx.setStorageSync(PROGRESS_FALLBACK_LIST_KEY, fallbackList)
    }

    if (!Array.isArray(fallbackList)) fallbackList = []

    const progressOverviewList = fallbackList.map(item => this.normalizeProgressItem(item))

    this.setData({
      progressOverviewList,
      progressLoading: false,
      progressUseFallback: true,
      progressUsingMockData
    })
  },

  shouldInjectProgressMockData() {
    if (!this.isDevelopEnv()) return false
    return wx.getStorageSync(PROGRESS_USE_MOCK_KEY) === true
  },

  buildProgressMockFallbackList() {
    const now = Date.now()
    return [
      {
        id: 'mock-progress-fudan-1',
        status: 'waiting_admission',
        stageText: PROGRESS_STAGE_MAP.waiting_admission,
        nextAction: '每天检查是否有名单更新',
        campId: 'mock-camp-fudan-1',
        campTitle: 'AI研究院2026年预推免通知',
        universityName: '复旦大学',
        deadlineText: '2026-03-12',
        updatedAtText: this.formatMockDateTime(now - 2 * HOUR_MS),
        subscriptionEnabled: true
      },
      {
        id: 'mock-progress-tsinghua-1',
        status: 'waiting_outstanding',
        stageText: PROGRESS_STAGE_MAP.waiting_outstanding,
        nextAction: '关注优秀营员结果发布',
        campId: 'mock-camp-tsinghua-1',
        campTitle: '计算机学院2026年优秀大学生夏令营',
        universityName: '清华大学',
        deadlineText: '2026-03-18',
        updatedAtText: this.formatMockDateTime(now - 6 * HOUR_MS),
        subscriptionEnabled: true
      }
    ]
  },

  normalizeProgressItem(item = {}) {
    return {
      id: String(item.id || ''),
      status: String(item.status || ''),
      stageText: item.stageText || PROGRESS_STAGE_MAP[item.status] || '进行中',
      nextAction: item.nextAction || this.getProgressDefaultNextAction(item.status),
      campId: String(item.campId || item.camp?.id || ''),
      campTitle: item.campTitle || item.camp?.title || '未命名公告',
      universityName: item.universityName || item.camp?.university?.name || '未知院校',
      deadlineText: item.deadlineText || this.formatProgressDate(item.camp?.deadline),
      updatedAtText: item.updatedAtText || this.formatProgressDateTime(item.updatedAt),
      subscriptionEnabled: item.subscriptionEnabled !== undefined
        ? Boolean(item.subscriptionEnabled)
        : item.subscription?.enabled !== false
    }
  },

  getProgressDefaultNextAction(status) {
    const actionMap = {
      followed: '先整理材料并确认报名入口',
      preparing: '检查材料完整性并准备提交',
      submitted: '关注入营名单发布时间',
      waiting_admission: '每天检查是否有名单更新',
      admitted: '准备营期安排并跟进后续通知',
      waiting_outstanding: '关注优秀营员结果发布',
      outstanding_published: '记录结果并准备下一步申请'
    }
    return actionMap[status] || '持续关注项目进展'
  },

  formatProgressDate(value) {
    const ts = this.safeGetTimestamp(value)
    if (!ts) return '待定'
    const date = new Date(ts)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  formatProgressDateTime(value) {
    const ts = this.safeGetTimestamp(value)
    if (!ts) return '未知'
    const date = new Date(ts)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  },

  loadHandledMap() {
    const raw = wx.getStorageSync(HANDLED_MAP_KEY)
    const handledMap = raw && typeof raw === 'object' ? raw : {}
    this.setData({ handledMap })
  },

  saveHandledMap(handledMap) {
    wx.setStorageSync(HANDLED_MAP_KEY, handledMap)
  },

  async loadReminders({ preserveOnEmpty = false } = {}) {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const result = await reminderService.getReminders({ page: 1, limit: 200, status: 'all' })
      const serverList = Array.isArray(result?.data) ? result.data : []
      const rawList = this.withDebugMockReminders(serverList)
      const normalizedReminders = rawList
        .map(item => this.normalizeReminder(item))
        .filter(item => item)
      const reminders = await this.enrichRemindersWithChangeSignals(normalizedReminders)

      if (preserveOnEmpty && reminders.length === 0 && this.data.reminders.length > 0) {
        this.recomputeView()
        return
      }

      this.setData({ reminders })
      this.recomputeView()
    } catch (error) {
      console.error('加载提醒失败:', error)
      wx.showToast({
        title: '加载提醒失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async enrichRemindersWithChangeSignals(reminders = []) {
    if (!Array.isArray(reminders) || reminders.length === 0) {
      return reminders
    }

    const [alertSignalMap, snapshotSignalMap] = await Promise.all([
      this.fetchProgressAlertSignals(reminders),
      this.detectCampSnapshotChanges(reminders)
    ])

    return reminders.map(reminder => this.mergeReminderSignals(
      reminder,
      alertSignalMap[reminder.campId],
      snapshotSignalMap[reminder.campId]
    ))
  },

  mergeReminderSignals(reminder, alertSignal, snapshotSignal) {
    const mergedSignal = this.mergeChangeSignals(alertSignal, snapshotSignal)
    if (!mergedSignal) {
      return reminder
    }

    const mergedReminder = {
      ...reminder,
      hasChange: true,
      changeTypes: mergedSignal.changeTypes,
      changeSummary: mergedSignal.changeSummary || reminder.changeSummary || '',
      changeAt: mergedSignal.changeAt || reminder.changeAt || '',
      eventType: mergedSignal.eventType || reminder.eventType,
      eventTime: mergedSignal.eventTime || reminder.eventTime,
      actionType: mergedSignal.actionType || reminder.actionType || '',
      actionToken: mergedSignal.actionToken || reminder.actionToken || '',
      actionLabel: mergedSignal.actionLabel || reminder.actionLabel || '',
      actionExpireAt: mergedSignal.actionExpireAt || reminder.actionExpireAt || '',
      progressId: mergedSignal.progressId || reminder.progressId || ''
    }
    mergedReminder.eventTimeLabel = this.getEventTimeLabel(mergedReminder.eventType)
    mergedReminder.eventTimestamp = this.safeGetTimestamp(mergedReminder.eventTime)

    return this.decorateReminder(mergedReminder, mergedReminder.isHandled)
  },

  mergeChangeSignals(alertSignal, snapshotSignal) {
    if (!alertSignal && !snapshotSignal) {
      return null
    }

    const changeTypes = []
    ;[alertSignal, snapshotSignal].forEach(signal => {
      if (!signal || !Array.isArray(signal.changeTypes)) return
      signal.changeTypes.forEach(type => {
        if (type && changeTypes.indexOf(type) === -1) {
          changeTypes.push(type)
        }
      })
    })

    return {
      changeTypes,
      changeSummary: (alertSignal && alertSignal.changeSummary) ||
        (snapshotSignal && snapshotSignal.changeSummary) ||
        '公告信息有更新，请尽快核实',
      changeAt: (alertSignal && alertSignal.changeAt) || (snapshotSignal && snapshotSignal.changeAt) || '',
      eventType: (alertSignal && alertSignal.eventType) || (snapshotSignal && snapshotSignal.eventType) || '',
      eventTime: (alertSignal && alertSignal.eventTime) || (snapshotSignal && snapshotSignal.eventTime) || '',
      actionType: (alertSignal && alertSignal.actionType) || '',
      actionToken: (alertSignal && alertSignal.actionToken) || '',
      actionLabel: (alertSignal && alertSignal.actionLabel) || '',
      actionExpireAt: (alertSignal && alertSignal.actionExpireAt) || '',
      progressId: (alertSignal && alertSignal.progressId) || ''
    }
  },

  async fetchProgressAlertSignals(reminders = []) {
    if (!this.shouldUseRemoteProgressApi()) {
      return {}
    }

    const campIdSet = new Set(reminders.map(item => String(item.campId || '')).filter(Boolean))
    if (campIdSet.size === 0) {
      return {}
    }

    try {
      const result = await progressService.getAlerts({ page: 1, limit: 200 }, {
        showLoading: false,
        showError: false
      })
      const alerts = Array.isArray(result?.data) ? result.data : []
      const signalMap = {}

      alerts.forEach(alert => {
        const campId = String(alert?.campId || alert?.camp?.id || '')
        if (!campId || !campIdSet.has(campId)) {
          return
        }
        if (!alert?.event) {
          return
        }

        const nextSignal = this.transformProgressAlertToSignal(alert)
        if (!nextSignal) {
          return
        }

        const currentSignal = signalMap[campId]
        const shouldReplace = !currentSignal
          || nextSignal.sortTs > currentSignal.sortTs
          || (nextSignal.actionToken && !currentSignal.actionToken)
        if (shouldReplace) {
          signalMap[campId] = nextSignal
        }
      })

      return signalMap
    } catch (error) {
      return {}
    }
  },

  transformProgressAlertToSignal(alert) {
    const event = alert?.event || {}
    const eventType = String(event.eventType || '').toLowerCase()
    if (!eventType) {
      return null
    }

    const labels = this.resolveChangeTypeLabels(eventType, event.fieldName)
    const oldValue = this.normalizeSignalValue(event.oldValue)
    const newValue = this.normalizeSignalValue(event.newValue)
    const summary = this.buildAlertChangeSummary(labels, oldValue, newValue, alert?.content || '')
    const extractedTime = this.extractDateTimeFromText(newValue)
    const mappedEventType = eventType === 'deadline' ? '报名截止' : ''
    const actionType = String(alert?.actionType || '')
    const actionToken = String(alert?.actionToken || '')
    const actionExpireAt = alert?.actionExpireAt || ''
    const canConfirmAction = (
      actionType === 'confirm_progress_step' &&
      Boolean(actionToken) &&
      String(alert?.status || 'pending') !== 'handled'
    )

    return {
      sortTs: this.safeGetTimestamp(event.sourceUpdatedAt || alert.updatedAt || alert.createdAt || alert.scheduledAt || ''),
      changeTypes: labels,
      changeSummary: summary,
      changeAt: event.sourceUpdatedAt || alert.updatedAt || alert.createdAt || '',
      eventType: mappedEventType,
      eventTime: mappedEventType ? extractedTime : '',
      actionType: canConfirmAction ? actionType : '',
      actionToken: canConfirmAction ? actionToken : '',
      actionLabel: canConfirmAction ? '立即确认' : '',
      actionExpireAt: canConfirmAction ? actionExpireAt : '',
      progressId: alert?.progressId || ''
    }
  },

  resolveChangeTypeLabels(eventType = '', fieldName = '') {
    const labels = []
    const field = String(fieldName || '').toLowerCase()
    const add = (label) => {
      if (label && labels.indexOf(label) === -1) {
        labels.push(label)
      }
    }

    if (field.indexOf('deadline') > -1) add('截止时间')
    if (field.indexOf('material') > -1) add('材料清单')
    if (field.indexOf('requirement') > -1) add('申请要求')
    if (field.indexOf('process') > -1) add('流程安排')
    if (field.indexOf('startdate') > -1 || field.indexOf('enddate') > -1) add('举办时间')

    if (eventType === 'deadline') add('截止时间')
    if (eventType === 'materials') add('材料清单')
    if (eventType === 'admission_result') add('入营结果')
    if (eventType === 'outstanding_result') add('优秀营员结果')

    return labels.length > 0 ? labels : ['公告信息']
  },

  normalizeSignalValue(value) {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  },

  buildAlertChangeSummary(labels = [], oldValue = '', newValue = '', fallback = '') {
    const labelText = labels[0] || '公告信息'
    if (oldValue && newValue) {
      return `${labelText}已更新：${oldValue} -> ${newValue}`
    }
    if (newValue) {
      return `${labelText}已更新：${newValue}`
    }
    if (fallback) {
      return fallback
    }
    return `${labelText}有更新，请尽快核实`
  },

  extractDateTimeFromText(text = '') {
    if (!text) return ''
    const raw = String(text)
    const match = raw.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2})?/)
    if (!match) {
      return ''
    }
    return match[0].replace(/[/.]/g, '-')
  },

  async detectCampSnapshotChanges(reminders = []) {
    if (!this.shouldUseRemoteCampApi()) {
      return {}
    }

    const campIds = Array.from(new Set(reminders
      .map(item => String(item.campId || ''))
      .filter(Boolean)))

    if (campIds.length === 0) {
      return {}
    }

    const limitedCampIds = campIds.slice(0, 80)
    const snapshotMap = wx.getStorageSync(REMINDER_CAMP_SNAPSHOT_MAP_KEY) || {}
    const nextSnapshotMap = { ...snapshotMap }
    const signalMap = {}

    const campDetails = await this.fetchCampDetailsWithLimit(limitedCampIds, 6)
    campDetails.forEach(detail => {
      const campId = String(detail.id || '')
      if (!campId) return

      const currentSnapshot = this.normalizeCampSnapshot(detail)
      if (!currentSnapshot) return

      const previousSnapshot = snapshotMap[campId]
      const diff = this.diffCampSnapshot(previousSnapshot, currentSnapshot)
      if (previousSnapshot && diff.changedFields.length > 0) {
        signalMap[campId] = this.buildSnapshotChangeSignal(diff, previousSnapshot, currentSnapshot)
      }

      nextSnapshotMap[campId] = currentSnapshot
    })

    wx.setStorageSync(REMINDER_CAMP_SNAPSHOT_MAP_KEY, nextSnapshotMap)
    return signalMap
  },

  async fetchCampDetailsWithLimit(campIds = [], concurrency = 6) {
    const queue = campIds.slice()
    const results = []
    const workerCount = Math.min(Math.max(concurrency, 1), queue.length)

    const workers = Array.from({ length: workerCount }).map(async () => {
      while (queue.length > 0) {
        const campId = queue.shift()
        if (!campId) continue
        try {
          const detail = await campService.getCampDetail(campId, {
            showLoading: false,
            showError: false
          })
          if (detail && typeof detail === 'object') {
            results.push(detail)
          }
        } catch (error) {
          // ignore single camp detail failure
        }
      }
    })

    await Promise.all(workers)
    return results
  },

  normalizeCampSnapshot(detail) {
    if (!detail || typeof detail !== 'object') return null

    return {
      title: String(detail.title || '').trim(),
      announcementType: String(detail.announcementType || detail.announcement_type || '').trim(),
      deadline: this.normalizeDateValue(detail.deadline),
      startDate: this.normalizeDateValue(detail.startDate),
      endDate: this.normalizeDateValue(detail.endDate),
      location: String(detail.location || '').trim(),
      requirements: this.normalizeStructuredValue(detail.requirements),
      materials: this.normalizeStructuredValue(detail.materials),
      process: this.normalizeStructuredValue(detail.process)
    }
  },

  normalizeDateValue(value) {
    if (!value) return ''
    const timestamp = this.safeGetTimestamp(value)
    if (!timestamp) {
      return String(value).trim()
    }
    const parsed = new Date(timestamp)
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  normalizeStructuredValue(value) {
    if (value === null || value === undefined) return ''
    let parsed = value
    if (typeof parsed === 'string') {
      const text = parsed.trim()
      if (!text) return ''
      try {
        parsed = JSON.parse(text)
      } catch (error) {
        return text
      }
    }
    return this.stableStringify(parsed)
  },

  stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort()
      return `{${keys.map(key => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
  },

  diffCampSnapshot(previous, current) {
    if (!previous || !current) {
      return { changedFields: [] }
    }

    const watchedFields = [
      'title',
      'announcementType',
      'deadline',
      'startDate',
      'endDate',
      'location',
      'requirements',
      'materials',
      'process'
    ]

    const changedFields = watchedFields.filter(field => String(previous[field] || '') !== String(current[field] || ''))
    return { changedFields }
  },

  buildSnapshotChangeSignal(diff, previous, current) {
    const labelMap = {
      title: '公告标题',
      announcementType: '公告类型',
      deadline: '截止时间',
      startDate: '举办开始时间',
      endDate: '举办结束时间',
      location: '举办地点',
      requirements: '申请要求',
      materials: '材料清单',
      process: '流程安排'
    }

    const changeTypes = diff.changedFields.map(field => labelMap[field]).filter(Boolean)
    const isDeadlineChanged = diff.changedFields.indexOf('deadline') > -1
    const deadlineSummary = isDeadlineChanged
      ? `截止时间已更新：${previous.deadline || '未设置'} -> ${current.deadline || '未设置'}`
      : ''

    return {
      sortTs: Date.now(),
      changeTypes,
      changeSummary: deadlineSummary || `${changeTypes.join('、')}有更新，请尽快核实`,
      changeAt: this.formatMockDateTime(Date.now()),
      eventType: isDeadlineChanged ? '报名截止' : '',
      eventTime: isDeadlineChanged ? (current.deadline || '') : ''
    }
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteCampApi')
    if (forceRemote === true) {
      return true
    }
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  shouldUseRemoteProgressApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  withDebugMockReminders(serverList = []) {
    if (!this.shouldInjectRichMockReminders()) {
      return serverList
    }

    const mockList = this.buildRichMockReminderList()
    const merged = [...serverList]
    const existingIds = new Set(serverList.map(item => String(item?.id || '')))

    mockList.forEach(item => {
      const id = String(item?.id || '')
      if (!id || existingIds.has(id)) {
        return
      }
      merged.push(item)
      existingIds.add(id)
    })

    return merged
  },

  shouldInjectRichMockReminders() {
    if (!this.isDevelopEnv()) {
      return false
    }
    const setting = wx.getStorageSync(RICH_MOCK_REMINDERS_KEY)
    return setting !== false
  },

  isDevelopEnv() {
    try {
      const accountInfo = wx.getAccountInfoSync()
      return accountInfo?.miniProgram?.envVersion === 'develop'
    } catch (error) {
      return false
    }
  },

  buildRichMockReminderList() {
    const now = Date.now()
    const toDateTime = (offsetHours) => this.formatMockDateTime(now + offsetHours * HOUR_MS)

    return [
      // 清华大学
      {
        id: 'mock_reminder_thu_1',
        campId: 'mock_camp_thu_pre_1',
        campTitle: '计算机系2026年预推免通知',
        universityName: '清华大学',
        announcementType: 'pre_recommendation',
        eventType: '报名截止',
        eventTime: toDateTime(8),
        remindTime: toDateTime(2),
        status: 'pending',
        hasChange: true,
        changeTypes: ['报名截止时间', '材料清单'],
        changeSummary: '截止时间提前，材料新增导师意向表',
        updatedAt: toDateTime(-1)
      },
      {
        id: 'mock_reminder_thu_2',
        campId: 'mock_camp_thu_summer_2',
        campTitle: '电子系2026年优秀大学生夏令营',
        universityName: '清华大学',
        announcementType: 'summer_camp',
        eventType: '面试',
        eventTime: toDateTime(46),
        remindTime: toDateTime(30),
        status: 'pending',
        hasChange: false
      },
      {
        id: 'mock_reminder_thu_3',
        campId: 'mock_camp_thu_summer_3',
        campTitle: '交叉信息院2026年夏令营',
        universityName: '清华大学',
        announcementType: 'summer_camp',
        eventType: '报名截止',
        eventTime: toDateTime(140),
        remindTime: toDateTime(116),
        status: 'sent',
        isHandled: true,
        hasChange: false
      },

      // 北京大学
      {
        id: 'mock_reminder_pku_1',
        campId: 'mock_camp_pku_summer_1',
        campTitle: '软微学院2026年保研夏令营',
        universityName: '北京大学',
        announcementType: 'summer_camp',
        eventType: '报名截止',
        eventTime: toDateTime(20),
        remindTime: toDateTime(4),
        status: 'failed',
        hasChange: false
      },
      {
        id: 'mock_reminder_pku_2',
        campId: 'mock_camp_pku_pre_2',
        campTitle: '信科院2026年预推免接收办法',
        universityName: '北京大学',
        announcementType: 'pre_recommendation',
        eventType: '预报名开放',
        eventTime: toDateTime(60),
        remindTime: toDateTime(52),
        status: 'pending',
        hasChange: true,
        changeTypes: ['系统开放时间'],
        changeSummary: '预报名系统开放时间延后半天'
      },
      {
        id: 'mock_reminder_pku_3',
        campId: 'mock_camp_pku_pre_3',
        campTitle: '工学院2026年预推免通知',
        universityName: '北京大学',
        announcementType: 'pre_recommendation',
        eventType: '报名截止',
        eventTime: toDateTime(-12),
        remindTime: toDateTime(-30),
        status: 'expired',
        isHandled: true,
        hasChange: false
      },

      // 复旦大学
      {
        id: 'mock_reminder_fdu_1',
        campId: 'mock_camp_fdu_pre_1',
        campTitle: 'AI研究院2026年预推免通知',
        universityName: '复旦大学',
        announcementType: 'pre_recommendation',
        eventType: '报名截止',
        eventTime: toDateTime(6),
        remindTime: toDateTime(1),
        status: 'pending',
        hasChange: true,
        changeTypes: ['报名系统入口', '联系方式'],
        changeSummary: '报名链接更新，新增招生咨询邮箱'
      },
      {
        id: 'mock_reminder_fdu_2',
        campId: 'mock_camp_fdu_summer_2',
        campTitle: '计算机学院2026年优秀大学生夏令营',
        universityName: '复旦大学',
        announcementType: 'summer_camp',
        eventType: '线下面试',
        eventTime: toDateTime(68),
        remindTime: toDateTime(44),
        status: 'sent',
        hasChange: false
      },
      {
        id: 'mock_reminder_fdu_3',
        campId: 'mock_camp_fdu_summer_3',
        campTitle: '类脑智能学院2026年夏令营',
        universityName: '复旦大学',
        announcementType: 'summer_camp',
        eventType: '报名截止',
        eventTime: toDateTime(170),
        remindTime: toDateTime(146),
        status: 'pending',
        hasChange: false
      },

      // 上海交通大学
      {
        id: 'mock_reminder_sjtu_1',
        campId: 'mock_camp_sjtu_summer_1',
        campTitle: '电院2026年夏令营',
        universityName: '上海交通大学',
        announcementType: 'summer_camp',
        eventType: '报名截止',
        eventTime: toDateTime(10),
        remindTime: toDateTime(3),
        status: 'pending',
        hasChange: false
      },
      {
        id: 'mock_reminder_sjtu_2',
        campId: 'mock_camp_sjtu_pre_2',
        campTitle: '人工智能学院2026年预推免工作通知',
        universityName: '上海交通大学',
        announcementType: 'pre_recommendation',
        eventType: '材料提交',
        eventTime: toDateTime(72),
        remindTime: toDateTime(48),
        status: 'failed',
        hasChange: true,
        changeTypes: ['材料模板'],
        changeSummary: '推荐信模板已更新，请重新下载'
      }
    ]
  },

  formatMockDateTime(timestamp) {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  normalizeReminder(raw) {
    if (!raw || typeof raw !== 'object') return null

    const camp = raw.camp || {}
    const university = camp.university || {}
    const remindTime = raw.remindTime || ''
    const eventType = raw.eventType || '报名截止'
    const eventTime = raw.eventTime || camp.deadline || raw.deadline || ''
    const status = raw.status || 'pending'
    const normalizedAnnouncement = normalizeAnnouncementType({
      announcementType: raw.announcementType || camp.announcementType || camp.announcement_type || '',
      title: raw.campTitle || camp.title || '',
      sourceUrl: raw.sourceUrl || camp.sourceUrl || ''
    })

    const baseReminder = {
      id: String(raw.id || `${raw.campId || 'camp'}_${remindTime || Date.now()}`),
      campId: String(raw.campId || camp.id || ''),
      campTitle: raw.campTitle || camp.title || '未知夏令营/预推免',
      universityName: raw.universityName || university.name || '未知院校',
      announcementType: normalizedAnnouncement.announcementType,
      eventType,
      eventTime,
      eventTimeLabel: this.getEventTimeLabel(eventType),
      remindTime,
      status,
      statusText: this.getStatusText(status),
      remindTimestamp: this.safeGetTimestamp(remindTime),
      eventTimestamp: this.safeGetTimestamp(eventTime),
      hasChange: Boolean(raw.hasChange || raw.isChanged || raw.changeSummary || (Array.isArray(raw.changeTypes) && raw.changeTypes.length > 0)),
      changeTypes: Array.isArray(raw.changeTypes) ? raw.changeTypes : [],
      changeSummary: raw.changeSummary || '',
      changeAt: raw.changeAt || raw.updatedAt || '',
      actionType: String(raw.actionType || ''),
      actionToken: String(raw.actionToken || ''),
      actionLabel: String(raw.actionLabel || ''),
      actionExpireAt: raw.actionExpireAt || '',
      progressId: String(raw.progressId || '')
    }

    return this.decorateReminder(baseReminder, Boolean(raw.isHandled || raw.handled))
  },

  decorateReminder(reminder, handledOverride) {
    const isHandled = typeof handledOverride === 'boolean'
      ? handledOverride
      : Boolean(this.data.handledMap[reminder.id])

    const urgencyBucket = this.getUrgencyBucket(reminder.eventTimestamp)
    const priorityScore = this.getPriorityScore({
      urgencyBucket,
      eventTimestamp: reminder.eventTimestamp,
      hasChange: reminder.hasChange,
      isHandled
    })

    const changeSummary = reminder.changeSummary || this.buildChangeSummary(reminder.changeTypes)

    const decorated = {
      ...reminder,
      isHandled,
      urgencyBucket,
      priorityScore,
      changeSummary,
      deadlineHintText: this.getDeadlineHint(reminder.eventTimestamp),
      reminderHintText: this.getReminderHint(reminder.status, reminder.remindTimestamp, reminder.remindTime),
      attentionMessages: this.getAttentionMessages({ ...reminder, isHandled, changeSummary }),
      canQuickConfirm: Boolean(reminder.actionToken && reminder.actionType === 'confirm_progress_step'),
      schoolGroupKey: reminder.universityName || '未知院校'
    }
    return decorated
  },

  refreshDerivedForAll(reminders, handledMap) {
    return reminders.map(item => this.decorateReminder(item, Boolean(handledMap[item.id])))
  },

  safeGetTimestamp(dateStr) {
    if (!dateStr && dateStr !== 0) return 0

    if (typeof dateStr === 'number') {
      return Number.isFinite(dateStr) ? dateStr : 0
    }

    if (dateStr instanceof Date) {
      const ts = dateStr.getTime()
      return Number.isNaN(ts) ? 0 : ts
    }

    const normalized = this.normalizeDateTimeInput(dateStr)
    if (!normalized) return 0

    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) return 0
    return date.getTime()
  },

  normalizeDateTimeInput(input) {
    const raw = String(input || '').trim()
    if (!raw) return ''

    if (/^\d{10}$/.test(raw)) {
      return Number(raw) * 1000
    }
    if (/^\d{13}$/.test(raw)) {
      return Number(raw)
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return `${raw}T00:00:00`
    }

    if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) {
      return `${raw} 00:00:00`
    }

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(raw)) {
      return `${raw.replace(/\s+/, 'T')}:00`
    }

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return raw.replace(/\s+/, 'T')
    }

    if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(raw)) {
      return `${raw}:00`
    }

    if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return raw
    }

    return raw
  },

  getEventTimeLabel(eventType) {
    if (!eventType || eventType === '报名截止') {
      return '报名截止时间'
    }
    return `${eventType}时间`
  },

  getStatusText(status) {
    const statusMap = {
      pending: '待发送',
      sent: '已发送',
      expired: '已过期',
      failed: '发送异常'
    }
    return statusMap[status] || status
  },

  getUrgencyBucket(eventTimestamp) {
    if (!eventTimestamp) return 'later'

    const now = Date.now()
    const diff = eventTimestamp - now
    if (diff <= DAY_MS) return 'today'
    if (diff <= 3 * DAY_MS) return 'three_days'
    return 'later'
  },

  getPriorityScore({ urgencyBucket, eventTimestamp, hasChange, isHandled }) {
    if (isHandled) return 100000

    let score = 0
    if (urgencyBucket === 'today') score += 0
    if (urgencyBucket === 'three_days') score += 10000
    if (urgencyBucket === 'later') score += 20000

    if (hasChange) score -= 3000

    if (eventTimestamp > 0) {
      const diff = eventTimestamp - Date.now()
      score += Math.max(-500, Math.min(500, Math.floor(diff / HOUR_MS)))
    }

    return score
  },

  buildChangeSummary(changeTypes) {
    if (!Array.isArray(changeTypes) || changeTypes.length === 0) return ''
    return `信息有变更：${changeTypes.join('、')}`
  },

  getDeadlineHint(eventTimestamp) {
    if (!eventTimestamp) return '截止时间待补充'

    const diff = eventTimestamp - Date.now()
    if (diff < 0) {
      const days = Math.ceil(Math.abs(diff) / DAY_MS)
      if (days <= 1) return '已截止，请尽快确认后续安排'
      return `已截止 ${days} 天`
    }

    if (diff < HOUR_MS) return '今天即将截止'
    if (diff < DAY_MS) return '今天截止'
    if (diff < 2 * DAY_MS) return '明天截止'

    return `还剩 ${Math.ceil(diff / DAY_MS)} 天截止`
  },

  getReminderHint(status, remindTimestamp, remindTime) {
    if (status === 'pending') {
      if (!remindTimestamp) return '提醒时间待确认'

      const diff = remindTimestamp - Date.now()
      if (diff < 0) return '提醒时间已过，可重新设置'
      if (diff < HOUR_MS) return '将在1小时内发送提醒'
      if (diff < DAY_MS) return `将在 ${Math.ceil(diff / HOUR_MS)} 小时后发送提醒`
      return `将在 ${Math.ceil(diff / DAY_MS)} 天后发送提醒`
    }

    if (status === 'sent') {
      return remindTime ? `已于 ${remindTime} 发送提醒` : '提醒已发送'
    }

    if (status === 'failed') {
      return '提醒发送异常，可重新设置'
    }

    if (status === 'expired') {
      return '提醒已过期'
    }

    return '提醒状态未知'
  },

  getAttentionMessages(reminder) {
    const messages = []

    if (reminder.eventTimestamp > 0 && reminder.remindTimestamp > 0 && reminder.remindTimestamp > reminder.eventTimestamp) {
      messages.push('提醒时间晚于截止时间，建议提前设置')
    }

    if (!reminder.isHandled && reminder.status === 'failed') {
      messages.push('提醒发送异常，建议重新设置提醒')
    }

    if (!reminder.isHandled && reminder.status === 'expired') {
      messages.push('该提醒已过期，请确认是否仍需跟进')
    }

    return messages
  },

  recomputeView() {
    const { selectedViewMode, selectedFocusFilter, selectedSchoolFilter } = this.data
    const summary = this.buildSummary(this.data.reminders)
    const focusFilterHint = this.getFocusFilterHint(selectedFocusFilter)

    const baseReminders = selectedViewMode === 'task'
      ? this.applyFocusFilter(this.data.reminders)
      : this.data.reminders
    const sorted = [...baseReminders].sort((a, b) => a.priorityScore - b.priorityScore)

    const taskSections = this.buildTaskSections(sorted, selectedFocusFilter)
    const schoolGroups = this.buildSchoolGroups(
      this.data.reminders,
      this.data.schoolExpandMap,
      this.data.schoolViewFilterMap
    )
    const schoolFilterOptions = this.buildSchoolFilterOptions(schoolGroups)
    let activeSchoolFilter = selectedSchoolFilter
    const hasCurrentSchool = schoolFilterOptions.some(option => option.value === activeSchoolFilter)
    if (!hasCurrentSchool) {
      activeSchoolFilter = 'all'
    }

    const schoolFilterHint = this.getSchoolFilterHint(activeSchoolFilter, schoolFilterOptions)
    const groupedSchools = this.applySchoolCardFilter(schoolGroups, activeSchoolFilter)

    const emptyState = selectedViewMode === 'school'
      ? this.buildSchoolEmptyState(groupedSchools.length)
      : this.buildTaskEmptyState(sorted.length)

    this.setData({
      summary,
      schoolFilterOptions,
      selectedSchoolFilter: activeSchoolFilter,
      schoolFilterHint,
      focusFilterHint,
      taskSections,
      groupedSchools,
      emptyState
    })
  },

  buildSummary(reminders) {
    const unHandled = reminders.filter(item => !item.isHandled)

    const todayDueSchools = new Set(unHandled.filter(item => item.urgencyBucket === 'today').map(item => item.schoolGroupKey)).size
    const threeDaysDueSchools = new Set(unHandled.filter(item => item.urgencyBucket === 'three_days').map(item => item.schoolGroupKey)).size
    const changedSchools = new Set(unHandled.filter(item => item.hasChange).map(item => item.schoolGroupKey)).size

    return {
      todayDueSchools,
      threeDaysDueSchools,
      changedSchools
    }
  },

  getFocusFilterHint(filterValue) {
    const hintMap = {
      all: '查看全部提醒通知（含已查看）',
      today: '优先关注今天截止的夏令营/预推免通知',
      three_days: '查看未来3天内需要关注的夏令营/预推免通知',
      changed: '查看夏令营/预推免信息有变更的通知',
      handled: '查看已确认完成提交申请的夏令营/预推免通知'
    }
    return hintMap[filterValue] || hintMap.all
  },

  getSchoolFilterHint(filterValue, options = []) {
    if (filterValue === 'all') {
      return '查看所有关注学校的待关注夏令营/预推免通知'
    }

    const selectedOption = options.find(option => option.value === filterValue)
    if (!selectedOption) {
      return '查看所有关注学校的待关注夏令营/预推免通知'
    }

    return `仅查看 ${selectedOption.label} 的待关注夏令营/预推免通知`
  },

  applyFocusFilter(reminders) {
    const { selectedFocusFilter } = this.data

    if (selectedFocusFilter === 'today') {
      return reminders.filter(item => !item.isHandled && item.urgencyBucket === 'today')
    }

    if (selectedFocusFilter === 'three_days') {
      return reminders.filter(item => !item.isHandled && item.urgencyBucket === 'three_days')
    }

    if (selectedFocusFilter === 'changed') {
      return reminders.filter(item => !item.isHandled && item.hasChange)
    }

    if (selectedFocusFilter === 'handled') {
      return reminders.filter(item => item.isHandled)
    }

    return reminders
  },

  buildTaskSections(reminders, filterValue) {
    const pushSection = (sections, key, title, list) => {
      if (list.length > 0) {
        sections.push({ key, title, list })
      }
    }

    const sections = []

    if (filterValue === 'today') {
      pushSection(sections, 'today', '今日优先', reminders)
      return sections
    }

    if (filterValue === 'three_days') {
      pushSection(sections, 'three_days', '近期关注（3天内）', reminders)
      return sections
    }

    if (filterValue === 'changed') {
      pushSection(sections, 'changed', '信息有变更', reminders)
      return sections
    }

    if (filterValue === 'handled') {
      pushSection(sections, 'handled', '已查看通知', reminders)
      return sections
    }

    const changed = reminders.filter(item => !item.isHandled && item.hasChange)
    const changedIdSet = new Set(changed.map(item => item.id))
    const remaining = reminders.filter(item => !changedIdSet.has(item.id))

    const today = remaining.filter(item => !item.isHandled && item.urgencyBucket === 'today')
    const threeDays = remaining.filter(item => !item.isHandled && item.urgencyBucket === 'three_days')
    const later = remaining.filter(item => !item.isHandled && item.urgencyBucket === 'later')
    const handled = remaining.filter(item => item.isHandled)

    pushSection(sections, 'changed', '信息有变更', changed)
    pushSection(sections, 'today', '今日优先', today)
    pushSection(sections, 'three_days', '近期关注（3天内）', threeDays)
    pushSection(sections, 'later', '后续跟进', later)
    pushSection(sections, 'handled', '已查看通知', handled)

    return sections
  },

  applySchoolScopeFilter(reminders, scope) {
    if (scope === 'today') {
      return reminders.filter(item => item.urgencyBucket === 'today')
    }

    if (scope === 'three_days') {
      return reminders.filter(item => item.urgencyBucket === 'three_days')
    }

    if (scope === 'changed') {
      return reminders.filter(item => item.hasChange)
    }

    return reminders
  },

  buildSchoolGroups(reminders, schoolExpandMap = {}, schoolViewFilterMap = {}) {
    const map = {}

    reminders.forEach(reminder => {
      const key = reminder.schoolGroupKey || '未知院校'
      if (!map[key]) {
        map[key] = {
          key,
          schoolName: key,
          reminders: []
        }
      }
      map[key].reminders.push(reminder)
    })

    return Object.values(map)
      .map(group => {
        const sortedReminders = [...group.reminders].sort((a, b) => a.priorityScore - b.priorityScore)
        const unHandled = sortedReminders.filter(item => !item.isHandled)
        const activeScope = schoolViewFilterMap[group.key] || 'all'
        const scopedPendingReminders = this.applySchoolScopeFilter(unHandled, activeScope)
        const expanded = Boolean(schoolExpandMap[group.key])
        const visiblePendingReminders = expanded
          ? scopedPendingReminders
          : scopedPendingReminders.slice(0, 3)

        return {
          ...group,
          reminders: sortedReminders,
          activeScope,
          expanded,
          totalCount: sortedReminders.length,
          unHandledCount: unHandled.length,
          todayCount: unHandled.filter(item => item.urgencyBucket === 'today').length,
          threeDaysCount: unHandled.filter(item => item.urgencyBucket === 'three_days').length,
          changedCount: unHandled.filter(item => item.hasChange).length,
          scopedPendingCount: scopedPendingReminders.length,
          visiblePendingReminders,
          morePendingCount: Math.max(0, scopedPendingReminders.length - visiblePendingReminders.length),
          groupPriority: sortedReminders.length > 0 ? sortedReminders[0].priorityScore : 999999
        }
      })
      .sort((a, b) => a.groupPriority - b.groupPriority)
  },

  buildSchoolFilterOptions(schoolGroups) {
    const baseOption = { label: '全部学校', value: 'all' }
    const schoolOptions = schoolGroups.map(group => ({
      label: group.schoolName,
      value: group.key
    }))
    return [baseOption, ...schoolOptions]
  },

  applySchoolCardFilter(schoolGroups, schoolFilter) {
    if (!schoolFilter || schoolFilter === 'all') return schoolGroups
    return schoolGroups.filter(group => group.key === schoolFilter)
  },

  buildTaskEmptyState(filteredCount) {
    if (this.data.reminders.length === 0) {
      return {
        title: '还没有保研通知',
        desc: '在夏令营/预推免详情页设置提醒后会显示在这里'
      }
    }

    if (filteredCount > 0) {
      return { title: '', desc: '' }
    }

    const byFilter = {
      today: {
        title: '今日暂无优先关注通知',
        desc: '你今天没有即将截止的保研通知'
      },
      three_days: {
        title: '3天内暂无保研通知',
        desc: '近期可以先关注信息变更'
      },
      changed: {
        title: '暂无信息变更',
        desc: '当前关注通知暂无新的变更提示'
      },
      handled: {
        title: '暂无已查看记录',
        desc: '查看通知后可手动标记已查看'
      }
    }

    return byFilter[this.data.selectedFocusFilter] || {
      title: '当前筛选下暂无保研通知',
      desc: '可切换筛选条件查看其他提醒'
    }
  },

  buildSchoolEmptyState(filteredSchoolCount) {
    if (this.data.reminders.length === 0) {
      return {
        title: '还没有关注学校通知',
        desc: '在夏令营/预推免详情页设置提醒后会显示在这里'
      }
    }

    if (filteredSchoolCount > 0) {
      return { title: '', desc: '' }
    }

    if (this.data.selectedSchoolFilter && this.data.selectedSchoolFilter !== 'all') {
      return {
        title: '当前学校暂无待关注通知',
        desc: '可切换到其他学校查看通知'
      }
    }

    return {
      title: '当前筛选下暂无学校',
      desc: '可切换学校筛选查看其他内容'
    }
  },

  onViewModeTap(e) {
    this.setData({ selectedViewMode: e.currentTarget.dataset.value })
    this.recomputeView()
  },

  onSchoolFilterTap(e) {
    this.setData({ selectedSchoolFilter: e.currentTarget.dataset.value })
    this.recomputeView()
  },

  onFocusFilterTap(e) {
    this.setData({ selectedFocusFilter: e.currentTarget.dataset.value })
    this.recomputeView()
  },

  onOpenAdvancedSubscription() {
    this.setData({ activeCenterTab: 'progress' })
    this.loadProgressOverview()
  },

  onOpenProgressDetail(e) {
    const id = e?.currentTarget?.dataset?.id
    if (!id) return
    wx.navigateTo({
      url: `/packageProgress/pages/progress-detail/index?id=${id}`
    })
  },

  onOpenSchoolSubscription() {
    wx.navigateTo({
      url: '/packageProgress/pages/school-subscription/index'
    })
  },

  onViewCamp(e) {
    const campId = e.currentTarget.dataset.campId
    const announcementType = e.currentTarget.dataset.announcementType || ''
    const title = e.currentTarget.dataset.title || ''
    if (!campId) return

    const query = [`id=${encodeURIComponent(campId)}`]
    if (announcementType) {
      query.push(`announcementType=${encodeURIComponent(announcementType)}`)
    }
    if (title) {
      query.push(`title=${encodeURIComponent(title)}`)
    }

    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?${query.join('&')}`
    })
  },

  onQuickConfirm(e) {
    const actionToken = String(e?.currentTarget?.dataset?.actionToken || '').trim()
    if (!actionToken) {
      wx.showToast({
        title: '当前通知不可确认',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/packageProgress/pages/action-landing/index?token=${encodeURIComponent(actionToken)}`
    })
  },

  onToggleSchoolExpand(e) {
    const schoolKey = e.currentTarget.dataset.schoolKey
    if (!schoolKey) return

    const nextExpandMap = { ...this.data.schoolExpandMap }
    nextExpandMap[schoolKey] = !Boolean(nextExpandMap[schoolKey])

    this.setData({ schoolExpandMap: nextExpandMap })
    this.recomputeView()
  },

  onSchoolScopeTap(e) {
    const schoolKey = e.currentTarget.dataset.schoolKey
    const scope = e.currentTarget.dataset.scope
    if (!schoolKey || !scope) return

    const nextSchoolViewFilterMap = { ...this.data.schoolViewFilterMap }
    nextSchoolViewFilterMap[schoolKey] = scope

    const nextExpandMap = { ...this.data.schoolExpandMap }
    if (scope !== 'all') {
      nextExpandMap[schoolKey] = true
    }

    this.setData({
      schoolViewFilterMap: nextSchoolViewFilterMap,
      schoolExpandMap: nextExpandMap
    })
    this.recomputeView()
  },

  onSnoozeReminder(e) {
    const reminderId = e.currentTarget.dataset.reminderId
    const reminder = this.data.reminders.find(item => item.id === reminderId)
    if (!reminder) return

    const query = [
      `campId=${encodeURIComponent(reminder.campId || '')}`,
      `title=${encodeURIComponent(reminder.campTitle || '')}`,
      `deadline=${encodeURIComponent(reminder.eventTime || '')}`,
      `universityName=${encodeURIComponent(reminder.universityName || '')}`
    ].join('&')

    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?${query}`
    })
  },

  onToggleHandled(e) {
    const reminderId = e.currentTarget.dataset.reminderId
    if (!reminderId) return

    const nextHandled = !Boolean(this.data.handledMap[reminderId])
    const nextHandledMap = { ...this.data.handledMap }

    if (nextHandled) {
      nextHandledMap[reminderId] = true
    } else {
      delete nextHandledMap[reminderId]
    }

    const reminders = this.refreshDerivedForAll(this.data.reminders, nextHandledMap)

    this.setData({
      handledMap: nextHandledMap,
      reminders
    })
    this.saveHandledMap(nextHandledMap)
    this.recomputeView()

    wx.showToast({
      title: nextHandled ? '已标记处理' : '已取消处理',
      icon: 'none'
    })
  }
})
