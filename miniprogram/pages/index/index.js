// 首页 v0.2 - AI 助理今日新机会
import { assistantService } from '../../services/assistant'
import { profileV2Service } from '../../services/profile-v2'
import { subscriptionService } from '../../services/subscription'
import { http } from '../../services/http'
// 注：首页"轻收藏"不请求微信订阅消息授权（避免 touchend 异步链路下静默 fail 的体验割裂）
// requestDeadlineQuota 仅在详情页使用

const RECOMMENDATION_MAP = {
  recommend: { icon: '🟢', text: '推荐', cls: 'match-recommendation-success' },
  reference: { icon: '🟡', text: '可参考', cls: 'match-recommendation-warning' },
  skip: { icon: '⚪', text: '可跳过', cls: 'match-recommendation-skip' }
}

const REQ_ICON_MAP = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  unknown: '?'
}

Page({
  data: {
    loading: false,
    hasProfile: false,
    hasSubscription: false,
    profileCompleteness: 0,
    subscribedCount: 0,
    // Tab：new=新机会(未操作), bookmarked=已收藏, applied=已申请
    // 数据层仍用 null/interested/applied，前端做映射
    activeTab: 'new',
    opportunities: [],
    stats: {
      bookmarkedCount: 0,  // 等于后端 interested
      appliedCount: 0,
      recommendCount: 0
    },
    emptyStateText: '今天没有新机会，明天再来看看',
    // 探探式叠加卡片状态
    deckIndex: 0,          // 当前最上层卡片的索引
    swipeOffsetX: 0,       // 顶层卡片当前 x 偏移
    swipeOffsetY: 0,       // 顶层卡片当前 y 偏移
    swiping: false,        // 是否正在拖拽
    swipeFlying: '',       // 'left' | 'right' 飞出方向
    SWIPE_TRIGGER: 100,    // 触发飞出的距离阈值（px）
    // 撤销 Toast 状态
    undoVisible: false,
    undoCard: null,         // 被隐藏的卡片对象（用于回插）
    undoCardIndex: 0,       // 被隐藏前在 opportunities 数组中的索引
    undoCountdown: 5        // 倒计时秒数
  },

  onLoad(query) {
    this.refresh()
    const jobId = (query && query.jobId) || wx.getStorageSync('activeCrawlJobId') || ''
    if (jobId) this.startJobPolling(jobId)
    else this.restoreLatestJobBanner()
  },

  onShow() {
    this.refresh()
    const jobId = this.data.activeJobId || wx.getStorageSync('activeCrawlJobId')
    if (jobId && !this._jobPollTimer) this.startJobPolling(jobId)
  },

  // 点击需要登录的功能时调用：未登录则弹"去登录"，已登录则放行
  requireLoginOrPrompt(thenAction) {
    if (wx.getStorageSync('token')) {
      thenAction && thenAction()
      return
    }
    wx.showModal({
      title: '需要先登录',
      content: '登录后才能保存档案、订阅院系、收到 AI 抓取的公告。',
      confirmText: '微信登录',
      cancelText: '稍后再说',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '登录中...', mask: true })
        try {
          const token = await http.login()
          wx.hideLoading()
          if (!token) {
            wx.showToast({ title: '登录失败', icon: 'none' })
            return
          }
          wx.showToast({ title: '已登录', icon: 'success', duration: 800 })
          thenAction && thenAction()
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: e?.message || '登录失败', icon: 'none' })
        }
      }
    })
  },

  // 各引导卡片点击
  onTapGuideProfile() {
    this.requireLoginOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/profile-edit/index' })
    )
  },
  onTapGuideSelector() {
    this.requireLoginOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/dept-selector/index' })
    )
  },
  onTapGuideSubmitUrl() {
    this.requireLoginOrPrompt(() =>
      wx.navigateTo({ url: '/packageAssistant/pages/submit-url/index' })
    )
  },

  onHide() { this.stopJobPolling(); this.clearUndoTimers && this.clearUndoTimers() },
  onUnload() { this.stopJobPolling(); this.clearUndoTimers && this.clearUndoTimers() },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  // ============ 抓取作业进度 banner ============
  async restoreLatestJobBanner() {
    // 首页冷启时，如果用户最近一次作业还在 running，自动接上
    try {
      const latest = await subscriptionService.getLatestCrawlJob()
      if (latest && latest.jobId && (latest.status === 'queued' || latest.status === 'running')) {
        wx.setStorageSync('activeCrawlJobId', latest.jobId)
        this.startJobPolling(latest.jobId)
      }
    } catch (e) {
      // 未登录或网络问题，静默
    }
  },

  startJobPolling(jobId) {
    if (!jobId) return
    this.stopJobPolling()
    this.setData({ activeJobId: jobId, jobBanner: { visible: true, status: 'loading', progressPercent: 0 } })
    this.fetchJobOnce(jobId)
    this._jobPollTimer = setInterval(() => this.fetchJobOnce(jobId), 15000)
  },

  stopJobPolling() {
    if (this._jobPollTimer) {
      clearInterval(this._jobPollTimer)
      this._jobPollTimer = null
    }
  },

  async fetchJobOnce(jobId) {
    try {
      const job = await subscriptionService.getCrawlJob(jobId)
      // 计算实际耗时（从作业 startedAt 起）
      const startedAtMs = job.startedAt ? new Date(job.startedAt).getTime() : Date.now()
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
      const campsFound = job.campsFound || 0

      // "抓不到 → 引导用户手动补充"判定：
      //   1) running/queued 且超过 60s 还没拿到任何公告
      //   2) completed 但 campsFound === 0
      const STUCK_THRESHOLD = 60
      const stuckRunning =
        (job.status === 'running' || job.status === 'queued') &&
        elapsedSeconds > STUCK_THRESHOLD &&
        campsFound === 0
      const completedEmpty = job.status === 'completed' && campsFound === 0
      const showManualSubmitHint = stuckRunning || completedEmpty

      this.setData({
        jobBanner: {
          visible: true,
          jobId,
          status: job.status,
          campsFound,
          elapsedSeconds,
          isSlowWarning: !!job.isSlowWarning,
          emptyTargets: job.emptyTargets || [],
          stuckRunning,
          completedEmpty,
          showManualSubmitHint
        }
      })
      if (job.status === 'completed' || job.status === 'failed') {
        this.stopJobPolling()
        wx.removeStorageSync('activeCrawlJobId')
        // 完成后刷新首页"今日新机会"
        this.refresh()
        // 只有"抓到了公告"才自动收起 banner；抓不到则保留，让用户看到手动补充入口
        if (job.status === 'completed' && campsFound > 0) {
          setTimeout(() => this.setData({ 'jobBanner.collapsed': true }), 8000)
        }
      }
    } catch (e) {
      console.warn('[job poll]', e && e.message)
    }
  },

  onCloseJobBanner() {
    this.stopJobPolling()
    wx.removeStorageSync('activeCrawlJobId')
    this.setData({ jobBanner: { visible: false } })
  },

  onJobBannerEmptyFeedback(e) {
    const { deptId, deptName } = e.currentTarget.dataset
    const jobId = this.data.activeJobId
    if (!jobId) return
    wx.showActionSheet({
      itemList: ['公告页地址错误', '该学院已发布但未抓到', '其他原因'],
      success: (res) => {
        const issueType = ['link_dead', 'crawl_missed', 'other'][res.tapIndex]
        subscriptionService.submitCrawlJobFeedback(jobId, {
          departmentId: deptId,
          issueType
        })
          .then(() => wx.showToast({ title: '已收到反馈', icon: 'success' }))
          .catch(() => wx.showToast({ title: '反馈失败', icon: 'none' }))
      }
    })
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      // 并行拉取档案 + 订阅状态 + 机会列表
      const [profileResp, schoolsResp] = await Promise.all([
        profileV2Service.get().catch(() => null),
        subscriptionService.listSchools().catch(() => null)
      ])

      const hasProfile = !!profileResp?.exists
      const hasSubscription = (schoolsResp?.totalSubscribed || 0) > 0

      this.setData({
        hasProfile,
        hasSubscription,
        profileCompleteness: profileResp?.completeness || 0,
        subscribedCount: schoolsResp?.totalSubscribed || 0
      })

      if (hasSubscription) {
        await this.loadOpportunities()
      } else {
        this.setData({ opportunities: [] })
      }
    } catch (err) {
      // 静默失败
    } finally {
      this.setData({ loading: false })
    }
  },

  // 前端 tab → 后端 action 映射
  tabToAction(tab) {
    if (tab === 'bookmarked') return 'interested'
    if (tab === 'applied') return 'applied'
    return 'undecided' // 'new' tab → 未操作过的
  },

  async loadOpportunities() {
    const action = this.tabToAction(this.data.activeTab)
    try {
      const resp = await assistantService.getOpportunities({ action, limit: 30 })
      const list = (resp?.data || []).map(this.normalizeOpportunity.bind(this))

      // 统计：只关心收藏数 + 已申请数
      const [bookmarkedResp, appliedResp] = await Promise.all([
        assistantService.getOpportunities({ action: 'interested', limit: 1 }).catch(() => ({ total: 0 })),
        assistantService.getOpportunities({ action: 'applied', limit: 1 }).catch(() => ({ total: 0 }))
      ])

      const recommendCount = list.filter(x => x.overallRecommendation === 'recommend').length

      this.setData({
        opportunities: list,
        deckIndex: 0,
        swipeOffsetX: 0,
        swipeOffsetY: 0,
        swiping: false,
        swipeFlying: '',
        stats: {
          bookmarkedCount: bookmarkedResp.total || 0,
          appliedCount: appliedResp.total || 0,
          recommendCount
        },
        emptyStateText:
          this.data.activeTab === 'bookmarked' ? '还没有收藏的公告，右滑卡片或点⭐ 收藏'
          : this.data.activeTab === 'applied' ? '还没有已申请的，看到合适的点"我已申请"标记'
          : '今天没有新机会，订阅的院系有动静会自动出现在这里'
      })
    } catch (err) {
      this.setData({ opportunities: [] })
    }
  },

  normalizeOpportunity(raw) {
    const rec = RECOMMENDATION_MAP[raw.overallRecommendation] || RECOMMENDATION_MAP.reference
    // 匹配度文案 — 用户要求"不要纯数字"
    const score = raw.matchScore || 0
    let matchLabel = ''
    let matchClass = ''
    if (raw.overallRecommendation === 'recommend') {
      matchLabel = '高度匹配你的档案'
      matchClass = 'match-tag-recommend'
    } else if (raw.overallRecommendation === 'reference') {
      matchLabel = '部分匹配 · 可作为备选'
      matchClass = 'match-tag-reference'
    } else {
      matchLabel = '与你方向不符'
      matchClass = 'match-tag-skip'
    }

    // 过期状态
    const deadlineInfo = this.formatDeadlineCompact(raw.extractedDeadline)

    // 公告类型 tag：夏令营 / 预推免
    const announcementType = raw.campType || raw.camp?.announcementType || 'summer_camp'
    const isPreRec = announcementType === 'pre_recommendation'
    const campTypeLabel = isPreRec ? '预推免' : '夏令营'
    const campTypeClass = isPreRec ? 'camp-type-pre-rec' : 'camp-type-summer'

    return {
      ...raw,
      recommendationIcon: rec.icon,
      recommendationText: rec.text,
      recommendationClass: rec.cls,
      matchLabel,
      matchClass,
      matchScoreShort: score,
      campTypeLabel,
      campTypeClass,
      deadlineText: deadlineInfo.text,
      deadlineUrgent: deadlineInfo.urgent,
      deadlineExpired: deadlineInfo.expired
    }
  },

  // 探探卡只关心"过期 / 紧迫 / 普通"三态
  formatDeadlineCompact(iso) {
    if (!iso) return { text: '截止日期未知', urgent: false, expired: false }
    const d = new Date(iso)
    if (isNaN(d.getTime())) return { text: '截止日期未知', urgent: false, expired: false }
    const diff = d.getTime() - Date.now()
    const days = Math.ceil(diff / 86400000)
    const m = d.getMonth() + 1, dd = d.getDate()
    if (days < 0) return { text: `已过期（${m}月${dd}日截止）`, urgent: false, expired: true }
    if (days === 0) return { text: `今日截止 · ${m}月${dd}日`, urgent: true, expired: false }
    if (days <= 7) return { text: `剩 ${days} 天 · ${m}月${dd}日截止 🔥`, urgent: true, expired: false }
    return { text: `剩 ${days} 天 · ${m}月${dd}日截止`, urgent: false, expired: false }
  },

  formatDeadline(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const now = Date.now()
    const diff = d.getTime() - now
    const days = Math.ceil(diff / 86400000)
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`
    if (days < 0) return `已过期（${dateStr}）`
    if (days === 0) return `今日截止 ${dateStr}`
    if (days <= 3) return `${dateStr} · 剩 ${days} 天 🔥`
    return `${dateStr} · 剩 ${days} 天`
  },

  // ============ 交互 ============

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab }, () => this.loadOpportunities())
  },

  onTapStat(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab }, () => this.loadOpportunities())
  },

  onTapMatch(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/packageAssistant/pages/match-detail/index?id=${id}` })
  },

  // ============ 主操作：收藏 / 已申请 / 隐藏 ============
  // 首页快速交互（右滑 + 卡片底部按钮 + 简表点击）一律走"轻收藏" —— 不弹微信订阅消息授权
  // 用户想要"截止前微信提醒"，需要进详情页点收藏（详情页保留授权流程）
  // toggle 入口：当前是 interested → 取消收藏；否则 → 仅 mark interested
  async onActionBookmark(e) {
    const id = e.currentTarget.dataset.id
    const userAction = e.currentTarget.dataset.userAction || ''
    if (userAction === 'interested') {
      return this.uncollectFromList(id)
    }
    await this.quickCollect(id)
    this.loadOpportunities()
  },

  uncollectFromList(matchId) {
    wx.showModal({
      title: '取消收藏',
      content: '取消后将不再收到截止提醒，确定吗？',
      confirmText: '取消收藏',
      confirmColor: '#d94343',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await assistantService.updateAction(matchId, 'reset')
          wx.showToast({ title: '已取消收藏', icon: 'success', duration: 1000 })
          this.loadOpportunities()
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 首页"轻收藏"：只 mark interested，不打断用户浏览节奏。
   * 不请求微信订阅消息授权 — 该流程移到详情页。
   */
  async quickCollect(matchId) {
    try {
      await assistantService.updateAction(matchId, 'interested')
    } catch (err) {
      wx.showToast({ title: '收藏失败，请重试', icon: 'none' })
      return
    }
    // icon=success 实心黑底 + 大对勾，视觉稳；不再用 icon=none（半透明会漏出底下内容）
    // "开启微信提醒"的引导信息放在详情页底部 hint 里，首页 toast 只确认动作完成即可
    wx.showToast({ title: '已收藏', icon: 'success', duration: 1500 })
  },

  async onActionApplied(e) {
    const id = e.currentTarget.dataset.id
    try {
      await assistantService.updateAction(id, 'applied')
      wx.showToast({ title: '已标记为已申请', icon: 'success' })
      this.loadOpportunities()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async onActionHide(e) {
    const id = e.currentTarget.dataset.id
    try {
      await assistantService.updateAction(id, 'hidden')
      this.loadOpportunities()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ============ 探探叠加卡：左右滑 + 飞出动画 ============
  _touchStartX: 0,
  _touchStartY: 0,
  _swipeBusy: false, // 飞出动画期间冻结手势

  onDeckTouchStart(e) {
    if (this._swipeBusy) return
    this._touchStartX = e.touches[0].clientX
    this._touchStartY = e.touches[0].clientY
    this.setData({ swiping: true })
  },

  onDeckTouchMove(e) {
    if (this._swipeBusy || !this.data.swiping) return
    const dx = e.touches[0].clientX - this._touchStartX
    const dy = e.touches[0].clientY - this._touchStartY
    // 垂直占优时不响应（留给页面滚动）
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return
    this.setData({ swipeOffsetX: dx, swipeOffsetY: dy * 0.3 })
  },

  onDeckTouchEnd() {
    if (this._swipeBusy) return
    const { swipeOffsetX, SWIPE_TRIGGER, deckIndex, opportunities } = this.data
    const current = opportunities[deckIndex]

    if (!current) {
      this.setData({ swipeOffsetX: 0, swipeOffsetY: 0, swiping: false })
      return
    }

    if (swipeOffsetX >= SWIPE_TRIGGER) {
      this.flyAway('right', current)
    } else if (swipeOffsetX <= -SWIPE_TRIGGER) {
      this.flyAway('left', current)
    } else {
      // 不够阈值 → 回弹
      this.setData({ swipeOffsetX: 0, swipeOffsetY: 0, swiping: false })
    }
  },

  flyAway(direction, card) {
    this._swipeBusy = true
    this.setData({ swipeFlying: direction, swiping: false })
    const hiddenIndex = this.data.deckIndex

    // 推进卡片到下一张（动画结束后）
    const advance = () => {
      this.setData({
        deckIndex: this.data.deckIndex + 1,
        swipeOffsetX: 0,
        swipeOffsetY: 0,
        swipeFlying: ''
      })
      this._swipeBusy = false
      if (direction === 'left') {
        this.showUndoBanner(card, hiddenIndex)
      }
    }

    if (direction === 'right') {
      // 右滑 = 轻收藏：不弹微信订阅消息（touchend 异步链路下 WeChat 会静默拒绝，
      //                体验割裂且不可控）；想要微信提醒的用户在详情页点收藏会拿到授权
      setTimeout(advance, 320)
      this.quickCollect(card.id)
    } else {
      // 左滑 = 隐藏
      setTimeout(() => {
        assistantService.updateAction(card.id, 'hidden').catch(() => null)
        advance()
      }, 320)
    }
  },

  // ============ 撤销 Toast ============
  _undoTimer: null,
  _undoCountdownTimer: null,

  showUndoBanner(card, originalIndex) {
    this.clearUndoTimers()
    this.setData({
      undoVisible: true,
      undoCard: card,
      undoCardIndex: originalIndex,
      undoCountdown: 5
    })
    // 倒计时秒数显示
    this._undoCountdownTimer = setInterval(() => {
      const next = this.data.undoCountdown - 1
      if (next <= 0) {
        // 倒计时归零：清掉这个 interval 自己（防泄漏），再走 dismiss
        if (this._undoCountdownTimer) {
          clearInterval(this._undoCountdownTimer)
          this._undoCountdownTimer = null
        }
        this.dismissUndoBanner()
      } else {
        this.setData({ undoCountdown: next })
      }
    }, 1000)
    // 兜底关闭（5s 后无操作自动消失）
    this._undoTimer = setTimeout(() => this.dismissUndoBanner(), 5200)
  },

  clearUndoTimers() {
    if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null }
    if (this._undoCountdownTimer) { clearInterval(this._undoCountdownTimer); this._undoCountdownTimer = null }
  },

  dismissUndoBanner() {
    // 幂等：多次调用安全
    this.clearUndoTimers()
    if (this.data.undoVisible) {
      this.setData({ undoVisible: false, undoCard: null })
    }
  },

  // 点击撤销
  async onUndoHide() {
    const card = this.data.undoCard
    const idx = this.data.undoCardIndex
    if (!card) return
    this.clearUndoTimers()
    this.setData({ undoVisible: false, undoCard: null })

    try {
      // 1) 后端：reset → 清空 userAction，公告回到"新机会"列表
      await assistantService.updateAction(card.id, 'reset')
    } catch (e) {
      // 即使后端失败，前端也回插一张让用户看到
    }

    // 2) 前端：把卡片重新插回到 opportunities 数组的 deckIndex 位置
    //    安全 clamp：用 list.length（splice 后真实长度）+ 0 兜底
    //    若 idx 超出当前列表（数组被后台 loadOpportunities 重置过），插到当前 deckIndex 位置
    const list = this.data.opportunities.slice()
    const safeIdx = Math.max(0, Math.min(idx, list.length))
    const targetIdx = list.length === 0
      ? 0
      : Math.min(safeIdx, this.data.deckIndex) // 不超过当前 deckIndex，否则用户看不到
    list.splice(targetIdx, 0, card)
    this.setData({
      opportunities: list,
      deckIndex: Math.min(targetIdx, list.length - 1)
    })
    wx.showToast({ title: '已恢复', icon: 'success', duration: 1000 })
  },

  onTapCurrentCard() {
    // 必须没在滑动才算 tap
    if (this.data.swiping || Math.abs(this.data.swipeOffsetX) > 6) return
    const { opportunities, deckIndex } = this.data
    const card = opportunities[deckIndex]
    if (!card) return
    wx.navigateTo({ url: `/packageAssistant/pages/match-detail/index?id=${card.id}` })
  },

  // 卡片底部"⭐收藏"按钮 - 复用右滑同样的"先订阅消息授权再推进卡片"流程
  async onDeckActionBookmark() {
    const card = this.data.opportunities[this.data.deckIndex]
    if (!card || this._swipeBusy) return
    this.flyAway('right', card)
  },

  async onDeckActionApplied() {
    // 立即按引用 capture card + 当前 deckIndex（防止 await 期间 opportunities 被 loadOpportunities 重置导致越界）
    const capturedCard = this.data.opportunities[this.data.deckIndex]
    const capturedIndex = this.data.deckIndex
    if (!capturedCard || this._swipeBusy) return
    this._swipeBusy = true
    try {
      await assistantService.updateAction(capturedCard.id, 'applied')
      wx.showToast({ title: '已标记为已申请', icon: 'success' })
      // 若 opportunities 已被刷新（capturedCard 不在当前列表第 capturedIndex 位），直接不推进 deckIndex，避免越界
      const current = this.data.opportunities[capturedIndex]
      if (current && current.id === capturedCard.id) {
        this.setData({ deckIndex: capturedIndex + 1, swipeOffsetX: 0, swipeOffsetY: 0 })
      }
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this._swipeBusy = false
    }
  },

  // 用户想"看完所有"，再加载下一批（这里简单刷新）
  onDeckExhausted() {
    this.loadOpportunities()
  },

  noop() {},

  // ============ 导航 ============

  goProfile() {
    wx.navigateTo({ url: '/packageAssistant/pages/profile-edit/index' })
  },

  goSelector() {
    wx.navigateTo({ url: '/packageAssistant/pages/dept-selector/index' })
  },

  goSubmitUrl() {
    wx.navigateTo({ url: '/packageAssistant/pages/submit-url/index' })
  },

  // 从抓取 banner 的"手动补充公告"按钮进入：附带 source 便于后续埋点
  goSubmitUrlFromBanner() {
    console.log('[home] tap submit-url from crawl banner')
    wx.navigateTo({ url: '/packageAssistant/pages/submit-url/index?from=crawl-stuck' })
  }
})
