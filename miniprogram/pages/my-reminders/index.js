// 我的提醒页（行动视角）
import { reminderService } from '../../services/reminder'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const HANDLED_MAP_KEY = 'reminderHandledMap'
const REMINDER_REFRESH_TOKEN_KEY = 'myRemindersRefreshToken'

Page({
  data: {
    summary: {
      todayDueSchools: 0,
      threeDaysDueSchools: 0,
      changedSchools: 0
    },
    viewModes: [
      { label: '按学校看', value: 'school' },
      { label: '按任务看', value: 'task' }
    ],
    selectedViewMode: 'school',
    schoolFilterOptions: [{ label: '全部学校', value: 'all' }],
    selectedSchoolFilter: 'all',
    schoolFilterHint: '',
    focusFilters: [
      { label: '全部', value: 'all' },
      { label: '今日必处理', value: 'today' },
      { label: '3天内需处理', value: 'three_days' },
      { label: '信息有变更', value: 'changed' },
      { label: '已处理', value: 'handled' }
    ],
    selectedFocusFilter: 'today',
    focusFilterHint: '',
    reminders: [],
    taskSections: [],
    groupedSchools: [],
    schoolExpandMap: {},
    schoolViewFilterMap: {},
    loading: false,
    initialized: false,
    lastRefreshToken: 0,
    handledMap: {},
    emptyState: {
      title: '暂无提醒任务',
      desc: '在夏令营/预推免详情页设置提醒后会出现在这里'
    }
  },

  onLoad() {
    this.loadHandledMap()
  },

  onShow() {
    const refreshToken = Number(wx.getStorageSync(REMINDER_REFRESH_TOKEN_KEY) || 0)

    if (!this.data.initialized) {
      this.setData({
        initialized: true,
        lastRefreshToken: refreshToken
      })
      this.loadReminders({ preserveOnEmpty: true })
      return
    }

    if (refreshToken > this.data.lastRefreshToken) {
      this.setData({ lastRefreshToken: refreshToken })
      this.loadReminders({ preserveOnEmpty: true })
    }
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
      const rawList = Array.isArray(result?.data) ? result.data : []
      const reminders = rawList
        .map(item => this.normalizeReminder(item))
        .filter(item => item)

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

  normalizeReminder(raw) {
    if (!raw || typeof raw !== 'object') return null

    const camp = raw.camp || {}
    const university = camp.university || {}
    const remindTime = raw.remindTime || ''
    const eventType = raw.eventType || '报名截止'
    const eventTime = raw.eventTime || camp.deadline || raw.deadline || ''
    const status = raw.status || 'pending'

    const baseReminder = {
      id: String(raw.id || `${raw.campId || 'camp'}_${remindTime || Date.now()}`),
      campId: String(raw.campId || camp.id || ''),
      campTitle: raw.campTitle || camp.title || '未知夏令营/预推免',
      universityName: raw.universityName || university.name || '未知院校',
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
      changeAt: raw.changeAt || raw.updatedAt || ''
    }

    return this.decorateReminder(baseReminder)
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
      schoolGroupKey: reminder.universityName || '未知院校'
    }

    decorated.displayTag = this.getDisplayTag(decorated)
    return decorated
  },

  refreshDerivedForAll(reminders, handledMap) {
    return reminders.map(item => this.decorateReminder(item, Boolean(handledMap[item.id])))
  },

  safeGetTimestamp(dateStr) {
    if (!dateStr) return 0
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return 0
    return date.getTime()
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

  getDisplayTag(reminder) {
    if (reminder.isHandled) {
      return { text: '已处理', type: 'handled' }
    }

    if (reminder.hasChange) {
      return { text: '有变更', type: 'changed' }
    }

    if (reminder.urgencyBucket === 'today') {
      return { text: '今日优先', type: 'urgent' }
    }

    if (reminder.urgencyBucket === 'three_days') {
      return { text: '近期关注', type: 'recent' }
    }

    return { text: '后续跟进', type: 'later' }
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
      all: '查看全部提醒任务（含已处理）',
      today: '优先处理今天截止的夏令营/预推免任务',
      three_days: '查看未来3天内需要处理的夏令营/预推免任务',
      changed: '查看夏令营/预推免信息有变更的任务',
      handled: '查看已确认完成提交申请的夏令营/预推免任务'
    }
    return hintMap[filterValue] || hintMap.all
  },

  getSchoolFilterHint(filterValue, options = []) {
    if (filterValue === 'all') {
      return '查看所有关注学校的待处理夏令营/预推免任务'
    }

    const selectedOption = options.find(option => option.value === filterValue)
    if (!selectedOption) {
      return '查看所有关注学校的待处理夏令营/预推免任务'
    }

    return `仅查看 ${selectedOption.label} 的待处理夏令营/预推免任务`
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
      pushSection(sections, 'today', '今日必处理', reminders)
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
      pushSection(sections, 'handled', '已处理任务', reminders)
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
    pushSection(sections, 'today', '今日必处理', today)
    pushSection(sections, 'three_days', '近期关注（3天内）', threeDays)
    pushSection(sections, 'later', '后续跟进', later)
    pushSection(sections, 'handled', '已处理任务', handled)

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
        title: '还没有提醒任务',
        desc: '在夏令营/预推免详情页设置提醒后会显示在这里'
      }
    }

    if (filteredCount > 0) {
      return { title: '', desc: '' }
    }

    const byFilter = {
      today: {
        title: '今日无需优先处理任务',
        desc: '你今天没有即将截止的任务'
      },
      three_days: {
        title: '3天内暂无任务',
        desc: '近期可以先关注信息变更'
      },
      changed: {
        title: '暂无信息变更',
        desc: '当前关注任务暂无新的变更通知'
      },
      handled: {
        title: '暂无已处理记录',
        desc: '完成任务后可手动标记已处理'
      }
    }

    return byFilter[this.data.selectedFocusFilter] || {
      title: '当前筛选下暂无任务',
      desc: '可切换筛选条件查看其他提醒'
    }
  },

  buildSchoolEmptyState(filteredSchoolCount) {
    if (this.data.reminders.length === 0) {
      return {
        title: '还没有关注学校任务',
        desc: '在夏令营/预推免详情页设置提醒后会显示在这里'
      }
    }

    if (filteredSchoolCount > 0) {
      return { title: '', desc: '' }
    }

    if (this.data.selectedSchoolFilter && this.data.selectedSchoolFilter !== 'all') {
      return {
        title: '当前学校暂无待处理任务',
        desc: '可切换到其他学校查看任务'
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

  onViewCamp(e) {
    const campId = e.currentTarget.dataset.campId
    if (!campId) return

    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?id=${campId}`
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
