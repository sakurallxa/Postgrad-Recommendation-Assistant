// 夏令营详情页
import { campService } from '../../../services/camp'
import { progressService } from '../../../services/progress'
import { normalizeAnnouncementType, ANNOUNCEMENT_TYPES } from '../../../services/announcement'

const PROGRESS_STATUS_LABELS = {
  followed: '已关注',
  preparing: '准备材料中',
  submitted: '已提交',
  waiting_admission: '待入营名单',
  admitted: '已入营',
  waiting_outstanding: '待优秀营员结果',
  outstanding_published: '优秀营员已发布'
}
const REMINDER_REFRESH_TOKEN_KEY = 'myRemindersRefreshToken'
const PROGRESS_FOLLOW_REFRESH_TOKEN_KEY = 'progressFollowRefreshToken'

Page({
  data: {
    campId: '',
    entryAnnouncementType: '',
    debugEnabled: false,
    debugTraceId: '',
    campDetail: {
      id: '',
      universityId: '',
      universityName: '',
      universityLogo: '',
      universityWebsite: '',
      title: '',
      announcementType: 'summer_camp',
      announcementTypeLabel: '夏令营公告',
      sourceUrl: '',
      publishDate: '',
      deadline: '',
      startDate: '',
      endDate: '',
      location: '',
      requirements: {
        hardConstraints: [],
        softSuggestions: [],
        uncertainItems: [],
        linkedMaterialTitles: [],
        profileComparison: null
      },
      materials: [],
      process: [],
      processDisplayMode: 'timeline',
      processTextFallback: [],
      processRawContent: '',
      processTextSource: '',
      originalContentDisplay: '',
      showOriginalContentSection: false,
      showRequirementsSection: false,
      showMaterialsSection: false,
      showProcessSection: false,
      contact: null,
      progressChangeEvents: [],
      riskHints: [],
      transparencyMeta: null,
      profileComparison: {
        hasProfile: false,
        status: 'unknown',
        label: '未知',
        description: '未检测到已填写档案，无法自动判断是否满足申请条件',
        counts: { satisfied: 0, pending: 0, unknown: 0 }
      },
      latestExtraction: null,
      lastCrawledAt: '',
      status: '',
      progressStatus: '',
      progressStatusLabel: '',
      progressId: '',
      hasReminder: false,
      hasProgress: false
    },
    loading: true,
    showCopySuccess: false,
    lastProgressFollowRefreshToken: 0,
    expandHardConstraints: false,
    expandSoftSuggestions: false,
    expandUncertainItems: false,
    expandMaterials: false
  },

  onLoad(options) {
    if (options.id) {
      const entryAnnouncementType = this.resolveEntryAnnouncementType(options)
      const debugEnabled = this.isDevelopEnv()
      const debugTraceId = `${Date.now()}_${options.id}`
      this._debugEnabled = debugEnabled
      this._debugTraceId = debugTraceId
      this.setData({
        campId: options.id,
        entryAnnouncementType,
        debugEnabled,
        debugTraceId,
        lastProgressFollowRefreshToken: Number(
          wx.getStorageSync(PROGRESS_FOLLOW_REFRESH_TOKEN_KEY) || 0
        )
      });
      this.debugLog('onLoad', {
        traceId: debugTraceId,
        options,
        resolvedEntryAnnouncementType: entryAnnouncementType
      })
      this.loadCampDetail();
    }
  },

  onShow() {
    this.refreshProfileComparison()
    this.syncFollowStateOnShow()
  },

  async loadCampDetail() {
    // 加载夏令营详情
    this.setData({ loading: true })

    try {
      if (this.shouldUseRemoteCampApi()) {
        const detail = await campService.getCampDetail(this.data.campId, {
          showLoading: false,
          showError: false
        })
        this.debugLog('detail:remote:raw', this.buildTypeSnapshot(detail))
        const normalized = this.applyEntryAnnouncementType(this.normalizeCampDetail(detail))
        this.debugLog('detail:remote:final', this.buildTypeSnapshot(normalized))
        this.assertAnnouncementTypeConsistency('remote', detail, normalized)
        const detailWithProgress = await this.withProgressFlag(normalized)
        this.setData({
          campDetail: detailWithProgress,
          loading: false,
          expandHardConstraints: false,
          expandSoftSuggestions: false,
          expandUncertainItems: false,
          expandMaterials: false
        })
        return
      }
    } catch (error) {
      // 远端不可用时走本地mock
    }

    const mockDetail = this.getMockDetail()
    this.debugLog('detail:mock:raw', this.buildTypeSnapshot(mockDetail))
    const normalizedMock = this.applyEntryAnnouncementType(this.normalizeCampDetail(mockDetail))
    this.debugLog('detail:mock:final', this.buildTypeSnapshot(normalizedMock))
    this.assertAnnouncementTypeConsistency('mock', mockDetail, normalizedMock)
    const mockWithProgress = await this.withProgressFlag(normalizedMock)
    this.setData({
      campDetail: mockWithProgress,
      loading: false,
      expandHardConstraints: false,
      expandSoftSuggestions: false,
      expandUncertainItems: false,
      expandMaterials: false
    })
  },

  async withProgressFlag(detail) {
    const list = wx.getStorageSync('progressFallbackList') || []
    const reminderCampIds = wx.getStorageSync('reminderCampIds') || []
    const exists = list.some(item => String(item.campId) === String(detail.id))
    const hasReminder = reminderCampIds.includes(detail.id)
    const progressState = await this.resolveProgressState(detail.id)
    const timeline = this.decorateProcessTimeline(
      detail.process,
      {
        ...detail,
        progressStatus: progressState.status || ''
      }
    )

    return {
      ...detail,
      hasProgress: Boolean(detail.hasProgress || exists || progressState.status),
      hasReminder: detail.hasReminder || hasReminder,
      progressId: progressState.progressId || detail.progressId || '',
      progressStatus: progressState.status || '',
      progressStatusLabel: progressState.statusLabel || '',
      process: timeline
    }
  },

  normalizeCampDetail(detail) {
    const normalized = normalizeAnnouncementType({
      ...detail,
      universityId: detail.universityId || detail.university?.id || '',
      universityName: detail.universityName || detail.university?.name || '',
      universityLogo: detail.universityLogo || detail.university?.logo || '',
      universityWebsite: detail.universityWebsite || detail.university?.website || '',
    })
    normalized.title = this.sanitizeCampTitle(normalized.title)
    normalized.publishDate = this.normalizeDisplayDate(normalized.publishDate)
    normalized.deadline = this.normalizeDisplayDate(normalized.deadline)
    normalized.startDate = this.normalizeDisplayDate(normalized.startDate)
    normalized.endDate = this.normalizeDisplayDate(normalized.endDate)
    normalized.eventDateText = this.buildEventDateText(normalized.startDate, normalized.endDate)
    if (!normalized.universityLogo) {
      normalized.universityLogo = this.getUniversityLogo(
        normalized.universityId,
        normalized.universityName,
        normalized.universityWebsite
      )
    }
    normalized.requirements = this.normalizeRequirements(normalized.requirements, normalized.confidence)
    normalized.materials = this.enrichMaterials(
      this.normalizeMaterials(normalized.materials),
      normalized.requirements?.linkedMaterialTitles || []
    )
    const processBundle = this.normalizeProcess(normalized.process, normalized)
    normalized.process = processBundle.list
    normalized.processDisplayMode = processBundle.displayMode
    normalized.processTextFallback = processBundle.fallbackList
    normalized.processRawContent = processBundle.rawContent
    normalized.processTextSource = processBundle.textSource
    normalized.originalContentDisplay = this.buildOriginalContentDisplay(normalized)
    normalized.originalContentDisplayMode = this.resolveOriginalContentDisplayMode(normalized.originalContentDisplay)
    normalized.showOriginalContentSection = Boolean(
      normalized.originalContentDisplay && normalized.originalContentDisplayMode === 'raw'
    )
    normalized.showRequirementsSection = this.shouldShowRequirementsSection(normalized.requirements, normalized.confidence)
    normalized.showMaterialsSection = this.shouldShowMaterialsSection(normalized.materials, normalized.confidence)
    normalized.showProcessSection = this.shouldShowProcessSection(processBundle, normalized.confidence)
    normalized.contact = this.normalizeContact(normalized.contact)
    normalized.riskHints = this.buildRiskHints(normalized)
    normalized.profileComparison = normalized.requirements?.profileComparison || this.buildProfileComparison([], null)
    normalized.transparencyMeta = this.buildTransparencyMeta(normalized)
    return normalized
  },

  normalizeEntryAnnouncementType(rawType) {
    if (!rawType) return ''
    const value = String(rawType).trim().toLowerCase().replace(/-/g, '_')
    if (value === ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION || value === ANNOUNCEMENT_TYPES.SUMMER_CAMP) {
      return value
    }
    if (/预推免|推免/.test(value)) {
      return ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION
    }
    if (/summer|夏令营|暑期/.test(value)) {
      return ANNOUNCEMENT_TYPES.SUMMER_CAMP
    }
    return ''
  },

  resolveEntryAnnouncementType(options = {}) {
    const rawType = this.safeDecodeQueryValue(options.announcementType || '')
    const fromRawType = this.normalizeEntryAnnouncementType(rawType)
    if (fromRawType) {
      return fromRawType
    }

    const title = this.safeDecodeQueryValue(options.title || options.campTitle || '')
    return this.normalizeEntryAnnouncementType(title)
  },

  safeDecodeQueryValue(value) {
    if (typeof value !== 'string' || !value) {
      return ''
    }
    try {
      return decodeURIComponent(value)
    } catch (error) {
      return value
    }
  },

  applyEntryAnnouncementType(detail) {
    if (!detail || typeof detail !== 'object') {
      return detail
    }

    const normalizedDetail = normalizeAnnouncementType(detail)
    const entryAnnouncementType = this.data.entryAnnouncementType
    if (!entryAnnouncementType || normalizedDetail.announcementType === entryAnnouncementType) {
      return normalizedDetail
    }

    const normalized = normalizeAnnouncementType({
      ...normalizedDetail,
      announcementType: entryAnnouncementType
    })
    return {
      ...normalizedDetail,
      announcementType: normalized.announcementType,
      announcementTypeLabel: normalized.announcementTypeLabel
    }
  },

  isDevelopEnv() {
    try {
      const accountInfo = wx.getAccountInfoSync()
      return accountInfo?.miniProgram?.envVersion === 'develop'
    } catch (error) {
      return false
    }
  },

  debugLog(step, payload = {}) {
    const enabled = this._debugEnabled || this.data.debugEnabled
    if (!enabled) {
      return
    }
    const traceId = this._debugTraceId || this.data.debugTraceId || 'no-trace-id'
    console.log(`[camp-detail-debug][${traceId}][${step}]`, payload)
  },

  buildTypeSnapshot(source = {}) {
    if (!source || typeof source !== 'object') {
      return {
        entryAnnouncementType: this.data.entryAnnouncementType || '',
        rawAnnouncementType: '',
        rawAnnouncementTypeAlias: '',
        announcementTypeLabel: '',
        title: ''
      }
    }

    return {
      entryAnnouncementType: this.data.entryAnnouncementType || '',
      rawAnnouncementType: source.announcementType || '',
      rawAnnouncementTypeAlias: source.announcement_type || source.type || source.noticeType || '',
      announcementTypeLabel: source.announcementTypeLabel || source.announcement_type_label || '',
      title: source.title || ''
    }
  },

  assertAnnouncementTypeConsistency(path, rawDetail, finalDetail) {
    const enabled = this._debugEnabled || this.data.debugEnabled
    if (!enabled) {
      return
    }

    const entryType = this.data.entryAnnouncementType || ''
    const rawType = this.normalizeEntryAnnouncementType(
      rawDetail?.announcementType ||
      rawDetail?.announcement_type ||
      rawDetail?.type ||
      rawDetail?.noticeType ||
      rawDetail?.title ||
      ''
    )
    const finalType = finalDetail?.announcementType || ''
    const isConsistent = !entryType || entryType === finalType

    if (!isConsistent) {
      console.error('[camp-detail-debug][assert-failed]', {
        traceId: this._debugTraceId || this.data.debugTraceId || '',
        path,
        entryType,
        rawType,
        finalType,
        rawTitle: rawDetail?.title || '',
        finalTitle: finalDetail?.title || ''
      })
      return
    }

    this.debugLog('assert-pass', {
      path,
      entryType,
      rawType,
      finalType
    })
  },

  async resolveProgressState(campId) {
    const fallback = this.getProgressStatusFromFallback(campId)

    if (!this.shouldUseRemoteProgressApi()) {
      return fallback
    }

    try {
      const remote = await this.getProgressStatusFromRemote(campId)
      if (remote.status) {
        return remote
      }
    } catch (error) {
      // 远端失败回落到本地
    }

    return fallback
  },

  async getProgressStatusFromRemote(campId) {
    const result = await progressService.getProgressList({ page: 1, limit: 200, status: 'all' }, {
      showLoading: false,
      showError: false
    })
    const list = Array.isArray(result?.data) ? result.data : []
    const matched = list.find(item => {
      const remoteCampId = item?.camp?.id || item?.campId || ''
      return String(remoteCampId) === String(campId)
    })

    if (!matched?.status) {
      return { progressId: '', status: '', statusLabel: '' }
    }

    return {
      progressId: matched.id || '',
      status: matched.status,
      statusLabel: PROGRESS_STATUS_LABELS[matched.status] || matched.status
    }
  },

  getProgressStatusFromFallback(campId) {
    const fallbackList = wx.getStorageSync('progressFallbackList') || []
    const matched = fallbackList.find(item => String(item.campId) === String(campId))
    if (!matched?.status) {
      return { progressId: '', status: '', statusLabel: '' }
    }

    return {
      progressId: matched.id || '',
      status: matched.status,
      statusLabel: PROGRESS_STATUS_LABELS[matched.status] || matched.statusText || matched.status
    }
  },

  normalizeStructuredData(value, fallback) {
    if (value === null || value === undefined) {
      return fallback
    }

    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return fallback
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed)
      } catch (error) {
        return fallback
      }
    }

    return value
  },

  normalizeRequirements(rawRequirements, defaultConfidence = 0.76) {
    const source = this.normalizeStructuredData(rawRequirements, null)
    const profile = this.getStudentProfile()
    const fallbackConfidence = this.normalizeConfidence(defaultConfidence)

    if (!source) {
      return {
        hardConstraints: [],
        softSuggestions: [],
        uncertainItems: [],
        linkedMaterialTitles: [],
        profileComparison: this.buildProfileComparison([], profile)
      }
    }

    const hardConstraints = []
    const softSuggestions = []
    const uncertainItems = []
    const pushEntry = (bucket, entry) => {
      if (!entry || !entry.content) return
      bucket.push(entry)
    }

    if (Array.isArray(source)) {
      source.forEach((item, index) => {
        const entry = this.normalizeRequirementEntry(item, {
          fallbackTitle: `条件${index + 1}`,
          fallbackSource: 'rule',
          fallbackConfidence
        })
        this.pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems)
      })
    } else if (typeof source !== 'object') {
      const entry = this.normalizeRequirementEntry(source, {
        fallbackTitle: '申请条件',
        fallbackSource: 'rule',
        fallbackConfidence
      })
      this.pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems)
    } else {
      const explicitHard = this.normalizeRequirementBucket(source.hardConstraints || source.hard_constraints, {
        bucketLabel: '硬性门槛',
        fallbackSource: source.source || source.extractionSource || 'rule',
        fallbackConfidence: this.normalizeConfidence(source.confidence || fallbackConfidence)
      })
      const explicitSoft = this.normalizeRequirementBucket(source.softSuggestions || source.soft_suggestions, {
        bucketLabel: '软性建议',
        fallbackSource: source.source || source.extractionSource || 'rule',
        fallbackConfidence: this.normalizeConfidence(source.confidence || fallbackConfidence)
      })
      const explicitUncertain = this.normalizeRequirementBucket(source.uncertainItems || source.uncertain_items, {
        bucketLabel: '不确定项',
        fallbackSource: source.source || source.extractionSource || 'rule',
        fallbackConfidence: this.normalizeConfidence(source.confidence || fallbackConfidence)
      })

      if (explicitHard.length > 0 || explicitSoft.length > 0 || explicitUncertain.length > 0) {
        explicitHard.forEach(entry => pushEntry(hardConstraints, entry))
        explicitSoft.forEach(entry => pushEntry(softSuggestions, entry))
        explicitUncertain.forEach(entry => pushEntry(uncertainItems, entry))
      } else {
        const usedKeys = new Set()
        const appendByKeys = (keys = [], title = '') => {
          for (const key of keys) {
            const value = source[key]
            const text = this.toDisplayText(value)
            if (!text) continue
            const entry = this.normalizeRequirementEntry({
              title: title || key,
              content: text,
              sourceSnippet: `${title || key}: ${text}`,
              source: 'rule',
              confidence: fallbackConfidence
            }, {
              fallbackTitle: title || key,
              fallbackSource: 'rule',
              fallbackConfidence
            })
            pushEntry(hardConstraints, entry)
            usedKeys.add(key)
            return
          }
        }

        appendByKeys(['education', 'degree', '学历要求'], '学历要求')
        appendByKeys(['gpa', 'gradeRank', 'grade_rank', 'rank', '成绩要求'], '成绩要求')
        appendByKeys(['english', '英语要求'], '英语要求')
        appendByKeys(['major', 'majorRequirement', '专业要求'], '专业要求')

        const sourceOther = source.other
        if (Array.isArray(sourceOther)) {
          sourceOther.forEach((item, index) => {
            const entry = this.normalizeRequirementEntry(item, {
              fallbackTitle: `补充说明${index + 1}`,
              fallbackSource: 'rule',
              fallbackConfidence
            })
            this.pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems)
          })
          usedKeys.add('other')
        } else {
          const otherText = this.toDisplayText(sourceOther)
          if (otherText) {
            const entry = this.normalizeRequirementEntry({
              title: '补充说明',
              content: otherText
            }, {
              fallbackTitle: '补充说明',
              fallbackSource: 'rule',
              fallbackConfidence
            })
            this.pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems)
            usedKeys.add('other')
          }
        }

        Object.keys(source).forEach(key => {
          if (usedKeys.has(key)) return
          if (['source', 'extractionSource', 'confidence'].indexOf(key) > -1) return
          const text = this.toDisplayText(source[key])
          if (!text) return
          const entry = this.normalizeRequirementEntry({
            title: key,
            content: text,
            source: 'rule',
            confidence: fallbackConfidence
          }, {
            fallbackTitle: key,
            fallbackSource: 'rule',
            fallbackConfidence
          })
          this.pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems)
        })
      }
    }

    const allEntries = []
      .concat(hardConstraints)
      .concat(softSuggestions)
      .concat(uncertainItems)

    const linkedMaterialTitles = this.collectLinkedMaterialTitles(allEntries)
    const comparedHardConstraints = hardConstraints.map(item => {
      const compare = this.compareRequirementWithProfile(item, profile)
      return {
        ...item,
        matchStatus: compare.status,
        matchStatusLabel: compare.label,
        matchReason: compare.reason || ''
      }
    })

    return {
      hardConstraints: comparedHardConstraints,
      softSuggestions,
      uncertainItems,
      linkedMaterialTitles,
      profileComparison: this.buildProfileComparison(comparedHardConstraints, profile)
    }
  },

  normalizeRequirementBucket(value, options = {}) {
    const source = this.normalizeStructuredData(value, [])
    if (!source) return []
    const list = Array.isArray(source) ? source : [source]
    return list
      .map((item, index) => this.normalizeRequirementEntry(item, {
        fallbackTitle: `${options.bucketLabel || '条件'}${index + 1}`,
        fallbackSource: options.fallbackSource || 'rule',
        fallbackConfidence: this.normalizeConfidence(options.fallbackConfidence)
      }))
      .filter(item => item && item.content)
  },

  normalizeRequirementEntry(rawEntry, options = {}) {
    const fallbackTitle = options.fallbackTitle || '申请条件'
    const fallbackSource = options.fallbackSource || 'rule'
    const fallbackConfidence = this.normalizeConfidence(options.fallbackConfidence)

    if (typeof rawEntry === 'string') {
      const content = rawEntry.trim()
      if (!content) return null
      return {
        title: fallbackTitle,
        content,
        sourceSnippet: content,
        extractionSource: fallbackSource,
        confidence: fallbackConfidence,
        linkedMaterials: this.extractLinkedMaterialsFromText(content)
      }
    }

    if (rawEntry === null || rawEntry === undefined) {
      return null
    }

    if (typeof rawEntry !== 'object') {
      const content = this.toDisplayText(rawEntry)
      if (!content) return null
      return {
        title: fallbackTitle,
        content,
        sourceSnippet: content,
        extractionSource: fallbackSource,
        confidence: fallbackConfidence,
        linkedMaterials: this.extractLinkedMaterialsFromText(content)
      }
    }

    const title = this.pickFirstText(rawEntry, ['title', 'name', 'field', 'label']) || fallbackTitle
    const content = this.pickFirstText(rawEntry, ['content', 'value', 'text', 'requirement']) || ''
    if (!content) {
      return null
    }
    const sourceSnippet = this.pickFirstText(rawEntry, ['sourceSnippet', 'source_snippet', 'snippet']) || `${title}: ${content}`
    const extractionSource = this.pickFirstText(rawEntry, ['source', 'extractionSource', 'extractor']) || fallbackSource
    const confidence = this.normalizeConfidence(rawEntry.confidence || rawEntry.score || fallbackConfidence)
    const linkedMaterials = this.normalizeMaterialRefs(rawEntry.materialRefs || rawEntry.materials || []).concat(
      this.extractLinkedMaterialsFromText(`${title} ${content}`)
    )

    return {
      title,
      content,
      sourceSnippet,
      extractionSource,
      confidence,
      linkedMaterials: this.uniqueStrings(linkedMaterials)
    }
  },

  normalizeMaterialRefs(value) {
    if (!value) return []
    const list = Array.isArray(value) ? value : [value]
    return list
      .map(item => this.toDisplayText(item))
      .filter(Boolean)
  },

  pushRequirementByText(entry, hardConstraints, softSuggestions, uncertainItems) {
    if (!entry || !entry.content) return
    const text = `${entry.title} ${entry.content}`.toLowerCase()
    if (/待定|另行通知|以官网为准|择优|视情况|可能/.test(text)) {
      uncertainItems.push(entry)
      return
    }
    if (/优先|建议|加分|鼓励|推荐/.test(text)) {
      softSuggestions.push(entry)
      return
    }
    hardConstraints.push(entry)
  },

  extractLinkedMaterialsFromText(text = '') {
    const source = String(text || '')
    if (!source) return []
    const dictionary = [
      { name: '个人简历', patterns: ['简历', 'cv'] },
      { name: '成绩单', patterns: ['成绩单', '成绩证明'] },
      { name: '英语成绩证明', patterns: ['英语', 'cet', '六级', '雅思', '托福'] },
      { name: '推荐信', patterns: ['推荐信', '推荐函'] },
      { name: '个人陈述', patterns: ['个人陈述', '自述', 'ps'] },
      { name: '研究计划', patterns: ['研究计划', '计划书', 'proposal'] },
      { name: '获奖证书', patterns: ['获奖', '证书', '奖项'] }
    ]
    const matched = []
    dictionary.forEach(entry => {
      if (entry.patterns.some(pattern => source.toLowerCase().indexOf(pattern.toLowerCase()) > -1)) {
        matched.push(entry.name)
      }
    })
    return this.uniqueStrings(matched)
  },

  collectLinkedMaterialTitles(entries = []) {
    const titles = []
    entries.forEach((entry) => {
      const current = Array.isArray(entry?.linkedMaterials) ? entry.linkedMaterials : []
      current.forEach(name => {
        const text = this.toDisplayText(name)
        if (text) {
          titles.push(text)
        }
      })
    })
    return this.uniqueStrings(titles)
  },

  buildProfileComparison(hardConstraints = [], profile = null) {
    if (!profile) {
      return {
        hasProfile: false,
        status: 'unknown',
        label: '未知',
        description: '未检测到已填写档案，无法自动判断是否满足申请条件',
        counts: { satisfied: 0, pending: 0, unknown: hardConstraints.length }
      }
    }

    const counts = { satisfied: 0, pending: 0, unknown: 0 }
    hardConstraints.forEach(item => {
      const status = item?.matchStatus || 'unknown'
      if (status === 'satisfied') counts.satisfied += 1
      else if (status === 'pending') counts.pending += 1
      else counts.unknown += 1
    })

    let status = 'unknown'
    let label = '未知'
    let description = '当前档案与申请条件匹配信息不足，建议手动核对官网原文'

    if (counts.pending > 0) {
      status = 'pending'
      label = '待补充'
      description = `发现 ${counts.pending} 条硬性门槛待补充，建议优先完善后再申请`
    } else if (hardConstraints.length > 0 && counts.satisfied === hardConstraints.length) {
      status = 'satisfied'
      label = '已满足申请条件'
      description = '已识别到的硬性门槛均满足，建议继续核对材料与流程节点'
    }

    return { hasProfile: true, status, label, description, counts }
  },

  compareRequirementWithProfile(item, rawProfile) {
    const profile = this.normalizeStudentProfile(rawProfile)
    if (!profile) {
      return { status: 'unknown', label: '未知', reason: '未填写档案' }
    }

    const content = `${item?.title || ''} ${item?.content || ''}`.toLowerCase()
    if (!content) {
      return { status: 'unknown', label: '未知', reason: '' }
    }

    if (/英语|cet|雅思|托福|六级/.test(content)) {
      const threshold = this.extractEnglishThreshold(content)
      const candidate = this.extractProfileEnglishScore(profile)
      if (!candidate || !threshold) {
        return { status: 'unknown', label: '未知', reason: '缺少可比对的英语分数信息' }
      }
      if (candidate >= threshold) {
        return { status: 'satisfied', label: '已满足', reason: `当前英语分数 ${candidate}，门槛 ${threshold}` }
      }
      return { status: 'pending', label: '待补充', reason: `当前英语分数 ${candidate}，低于门槛 ${threshold}` }
    }

    if (/前\d+%|top\s?\d+%|排名|gpa|成绩/.test(content)) {
      const threshold = this.extractRankThreshold(content)
      const rankPercent = this.extractProfileRankPercent(profile)
      if (threshold === null || rankPercent === null) {
        return { status: 'unknown', label: '未知', reason: '缺少可比对的成绩排名信息' }
      }
      if (rankPercent <= threshold) {
        return { status: 'satisfied', label: '已满足', reason: `当前排名前 ${rankPercent}% ，门槛前 ${threshold}%` }
      }
      return { status: 'pending', label: '待补充', reason: `当前排名前 ${rankPercent}% ，门槛前 ${threshold}%` }
    }

    if (/本科|学历|学位/.test(content)) {
      const degree = profile.education || ''
      if (!degree) {
        return { status: 'unknown', label: '未知', reason: '缺少学历档案信息' }
      }
      if (content.indexOf('本科') > -1 && degree.indexOf('本科') > -1) {
        return { status: 'satisfied', label: '已满足', reason: `学历为${degree}` }
      }
      return { status: 'unknown', label: '未知', reason: '需手动核对学历要求' }
    }

    if (/专业/.test(content)) {
      const major = (profile.major || '').toLowerCase()
      if (!major) {
        return { status: 'unknown', label: '未知', reason: '缺少专业档案信息' }
      }
      if (content.indexOf(major) > -1) {
        return { status: 'satisfied', label: '已满足', reason: `专业匹配：${profile.major}` }
      }
      return { status: 'unknown', label: '未知', reason: '专业匹配存在歧义，建议人工核对' }
    }

    return { status: 'unknown', label: '未知', reason: '暂不支持自动判断该条门槛' }
  },

  normalizeStudentProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      return null
    }
    const normalized = {
      education: this.toDisplayText(profile.education || profile.degree || profile.educationLevel),
      major: this.toDisplayText(profile.major || profile.majorName),
      englishScore: Number(profile.englishScore || profile.cet6 || profile.english || 0),
      rankPercent: Number(profile.rankPercent || profile.gradeRankPercent || profile.rank || 0)
    }
    if (!normalized.education && !normalized.major && !normalized.englishScore && !normalized.rankPercent) {
      return null
    }
    return normalized
  },

  getStudentProfile() {
    const candidates = [
      wx.getStorageSync('baoyanStudentProfile'),
      wx.getStorageSync('studentProfile'),
      wx.getStorageSync('userProfile')
    ]
    for (const value of candidates) {
      if (!value) continue
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          if (parsed && typeof parsed === 'object') {
            return parsed
          }
        } catch (error) {
          // ignore
        }
      } else if (typeof value === 'object') {
        return value
      }
    }
    return null
  },

  extractEnglishThreshold(content = '') {
    const normalized = String(content || '').toLowerCase()
    const explicit = normalized.match(/(?:cet[-\s]?6|六级)[^\d]{0,6}(\d{3})/)
    if (explicit && explicit[1]) {
      return Number(explicit[1])
    }
    const generic = normalized.match(/(\d{3})\s*分/)
    if (generic && generic[1]) {
      return Number(generic[1])
    }
    return null
  },

  extractProfileEnglishScore(profile = {}) {
    const score = Number(profile.englishScore || 0)
    if (!Number.isFinite(score) || score <= 0) return null
    return score
  },

  extractRankThreshold(content = '') {
    const normalized = String(content || '').toLowerCase()
    const match = normalized.match(/(?:前|top)\s*(\d{1,2})\s*%/)
    if (match && match[1]) {
      return Number(match[1])
    }
    return null
  },

  extractProfileRankPercent(profile = {}) {
    const rankPercent = Number(profile.rankPercent || 0)
    if (!Number.isFinite(rankPercent) || rankPercent <= 0) return null
    return rankPercent
  },

  normalizeConfidence(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) {
      return 0.76
    }
    if (number < 0) return 0
    if (number > 1) return 1
    return Number(number.toFixed(2))
  },

  uniqueStrings(list = []) {
    const seen = new Set()
    const result = []
    list.forEach((item) => {
      const text = this.toDisplayText(item)
      if (!text || seen.has(text)) return
      seen.add(text)
      result.push(text)
    })
    return result
  },

  normalizeMaterials(rawMaterials) {
    const source = this.normalizeStructuredData(rawMaterials, [])

    if (!source) {
      return []
    }

    if (Array.isArray(source)) {
      return source
    }

    if (typeof source === 'object') {
      return [source]
    }

    const text = String(source).trim()
    if (!text) {
      return []
    }

    return text
      .split(/[\n；;]/)
      .map(item => item.trim())
      .filter(Boolean)
  },

  shouldShowRequirementsSection(requirements = {}, confidence = 0) {
    const threshold = this.normalizeConfidence(confidence) >= 0.72
    const groups = []
      .concat(Array.isArray(requirements?.hardConstraints) ? requirements.hardConstraints : [])
      .concat(Array.isArray(requirements?.softSuggestions) ? requirements.softSuggestions : [])
      .concat(Array.isArray(requirements?.uncertainItems) ? requirements.uncertainItems : [])
      .filter(item => item && this.toDisplayText(item.content || item.text))

    if (groups.length === 0) {
      return false
    }

    const qualityCount = groups.filter((item) => {
      const text = this.toDisplayText(item.content || item.text)
      const title = this.toDisplayText(item.title)
      const itemConfidence = this.normalizeConfidence(item.confidence || confidence)
      return text.length >= 6 && text.length <= 120 && title.length <= 20 && itemConfidence >= 0.68
    }).length

    return threshold && qualityCount >= Math.min(2, groups.length)
  },

  shouldShowMaterialsSection(materials = [], confidence = 0) {
    if (!Array.isArray(materials) || materials.length === 0) {
      return false
    }
    if (this.normalizeConfidence(confidence) < 0.72) {
      return false
    }
    const qualityCount = materials.filter((item) => {
      const title = this.toDisplayText(item?.title || item)
      const detail = this.toDisplayText(item?.detail || '')
      if (!title) return false
      if (title.length > 36) return false
      if (/通知|公示|章程|办法|流程|条件/.test(title)) return false
      if (detail && detail.length > 120) return false
      return true
    }).length
    return qualityCount >= Math.min(2, materials.length)
  },

  normalizeProcess(rawProcess, detail = {}) {
    const source = this.normalizeStructuredData(rawProcess, [])
    let steps = []

    if (Array.isArray(source)) {
      steps = source
    } else if (source && typeof source === 'object') {
      steps = [source]
    } else if (typeof source === 'string' && source.trim()) {
      steps = source
        .split(/[\n；;]|->|→/)
        .map(item => item.trim())
        .filter(Boolean)
    }

    if (steps.length === 0) {
      return { list: [], displayMode: 'timeline', fallbackList: [], rawContent: '', textSource: '' }
    }

    const list = steps
      .map((item, index) => this.normalizeProcessStep(item, index, detail))
      .filter(item => item && item.action)

    const displayMode = this.shouldUseStructuredProcessTimeline(list) ? 'timeline' : 'text'
    const textBundle = displayMode === 'text'
      ? this.buildProcessTextBundle(detail, this.buildProcessFallbackList(list))
      : { rawContent: '', textSource: '' }
    return {
      list,
      displayMode,
      fallbackList: displayMode === 'text' ? this.buildProcessFallbackList(list) : [],
      rawContent: textBundle.rawContent,
      textSource: textBundle.textSource
    }
  },

  shouldShowProcessSection(processBundle = {}, confidence = 0) {
    const list = Array.isArray(processBundle?.list) ? processBundle.list : []
    if (processBundle?.displayMode !== 'timeline' || list.length === 0) {
      return false
    }
    if (this.normalizeConfidence(confidence) < 0.72) {
      return false
    }
    const qualityCount = list.filter((item) => {
      const action = this.toDisplayText(item?.action)
      const note = this.toDisplayText(item?.note)
      if (!action || action.length > 18) return false
      if (/通知|公示|章程|办法|结果名单|拟录取名单/.test(action)) return false
      if (note && note.length > 90) return false
      return true
    }).length
    return qualityCount >= Math.min(2, list.length)
  },

  buildProcessTextBundle(detail = {}, fallbackList = []) {
    const rawContent = this.buildProcessRawContent(detail)
    if (rawContent) {
      return { rawContent, textSource: 'raw' }
    }

    const title = this.toDisplayText(detail.title || '')
    const fallbackText = this.normalizeRawProcessContent(
      Array.isArray(fallbackList) ? fallbackList.filter(Boolean).join('\n\n') : '',
      title
    )
    if (fallbackText) {
      return { rawContent: fallbackText, textSource: 'fallback' }
    }

    return { rawContent: '', textSource: '' }
  },

  buildProcessRawContent(detail = {}) {
    const title = this.toDisplayText(detail.title || '')
    const rawContent = this.normalizeRawProcessContent(
      this.toDisplayText(detail.rawContent || ''),
      title
    )
    if (rawContent) {
      return this.prependTitleForRawContent(rawContent, title)
    }
    return ''
  },

  buildOriginalContentDisplay(detail = {}) {
    const title = this.toDisplayText(detail.title || '')
    const rawContent = this.normalizeRawProcessContent(
      this.toDisplayText(detail.rawContent || ''),
      title
    )
    if (!rawContent) {
      return ''
    }
    return this.prependTitleForRawContent(rawContent, title)
  },

  resolveOriginalContentDisplayMode(text = '') {
    const normalized = String(text || '').trim()
    if (!normalized) {
      return 'hidden'
    }
    if (this.isRosterLikeRawContent(normalized) || this.isSystemLikeTitle(normalized)) {
      return 'hidden'
    }
    return 'raw'
  },

  prependTitleForRawContent(rawContent = '', title = '') {
    const text = String(rawContent || '').trim()
    const normalizedTitle = String(title || '').trim()
    if (!text || !normalizedTitle) {
      return text
    }
    const compactText = text.replace(/\s+/g, '')
    const compactTitle = normalizedTitle.replace(/\s+/g, '')
    if (compactText.startsWith(compactTitle) || compactText.includes(compactTitle)) {
      return text
    }
    return `${normalizedTitle}\n\n${text}`
  },

  normalizeRawProcessContent(rawText = '', title = '') {
    const text = String(rawText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim()
    if (!text) {
      return ''
    }

    const normalizedParagraphs = this.normalizeRawParagraphs(text)
    if (normalizedParagraphs.length === 0) {
      return ''
    }

    const dedupedLines = this.trimRepeatedRawContentBlock(normalizedParagraphs, title)
    return dedupedLines
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  },

  isRosterLikeRawContent(text = '') {
    const source = String(text || '').trim()
    if (!source) return false
    const lines = source.split('\n').map(item => String(item || '').trim()).filter(Boolean)
    const longDenseLineCount = lines.filter(item => item.length >= 80 && !/[。！？；]/.test(item)).length
    const rosterTokenCount = (source.match(/[0-9]{2,}|大学|学院|专业|名单|学号|序号/g) || []).length
    const commaLikeCount = (source.match(/[、,，]/g) || []).length
    if (longDenseLineCount >= 2 && rosterTokenCount >= 20) {
      return true
    }
    if (rosterTokenCount >= 35 && commaLikeCount < 3) {
      return true
    }
    return false
  },

  isSystemLikeTitle(text = '') {
    const normalized = this.sanitizeCampTitle(text).toLowerCase()
    if (!normalized) return false
    const keywords = [
      '报名系统',
      '管理服务系统',
      '信息管理系统',
      '申请系统',
      '申请平台',
      '报名平台',
      '登录系统',
      '登录平台',
      '管理平台',
      '服务平台',
      '网报系统'
    ]
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return true
    }
    if (/(?:夏令营|推免|预推免|推荐免试).{0,8}(?:系统|平台)$/u.test(normalized)) {
      return true
    }
    return /(?:系统|平台)$/u.test(normalized)
  },

  normalizeRawParagraphs(text = '') {
    const source = String(text || '').replace(/\r\n/g, '\n')
    if (!source.trim()) {
      return []
    }

    const rawParagraphs = source
      .split(/\n{2,}/)
      .map(item => item.trim())
      .filter(Boolean)

    if (rawParagraphs.length > 1) {
      return rawParagraphs
        .map(item => this.normalizeRawParagraphText(this.mergeParagraphLines(item.split('\n'))))
        .filter(Boolean)
    }

    return this.rebuildParagraphsFromLines(source.split('\n'))
      .map(item => this.normalizeRawParagraphText(item))
      .filter(Boolean)
  },

  rebuildParagraphsFromLines(lines = []) {
    const source = Array.isArray(lines) ? lines.map(item => String(item || '').trim()).filter(Boolean) : []
    if (source.length === 0) {
      return []
    }

    const paragraphs = []
    let current = ''

    source.forEach((line, index) => {
      if (!current) {
        current = line
        return
      }

      if (this.shouldStartNewRawParagraph(current, line, index)) {
        paragraphs.push(current)
        current = line
        return
      }

      current = this.joinRawContentLine(current, line)
    })

    if (current) {
      paragraphs.push(current)
    }

    return paragraphs
  },

  mergeParagraphLines(lines = []) {
    const source = Array.isArray(lines) ? lines.map(item => String(item || '').trim()).filter(Boolean) : []
    if (source.length === 0) {
      return ''
    }

    let paragraph = source[0]
    for (let index = 1; index < source.length; index += 1) {
      const line = source[index]
      if (this.shouldStartNewRawParagraph(paragraph, line, index)) {
        paragraph = `${paragraph}\n${line}`
      } else {
        paragraph = this.joinRawContentLine(paragraph, line)
      }
    }
    return paragraph
  },

  shouldStartNewRawParagraph(prev = '', current = '', index = 0) {
    const previous = String(prev || '').trim()
    const next = String(current || '').trim()
    if (!previous || !next) {
      return false
    }

    if (this.isListLikeRawLine(next) || this.isAttachmentLikeRawLine(next)) {
      return true
    }
    if (this.isStandaloneHeadingLine(next)) {
      return true
    }
    if (/[：:]$/.test(previous)) {
      return true
    }
    if (/^(附件|附：|注：|备注[:：]?|说明[:：]?)/.test(next)) {
      return true
    }
    if (index > 0 && /^(第[一二三四五六七八九十]+[部分章节]|[一二三四五六七八九十]+、)/.test(next)) {
      return true
    }
    return false
  },

  joinRawContentLine(prev = '', current = '') {
    const previous = String(prev || '').trim()
    const next = String(current || '').trim()
    if (!previous) return next
    if (!next) return previous
    if (/^(作者|时间|来源|发布日期|发布时间|浏览次数|阅读次数|访问量|点击次数)[:：]/.test(next)) {
      return `${previous} ${next}`
    }
    if (/[A-Za-z0-9]$/.test(previous) && /^[A-Za-z0-9]/.test(next)) {
      return `${previous} ${next}`
    }
    return `${previous}${next}`
  },

  normalizeRawParagraphText(text = '') {
    let value = String(text || '').trim()
    if (!value) {
      return ''
    }
    value = value.replace(/^(?:.+?(?:研究生招生信息网|招生信息网|研究生院官网|研究生院|研招网)(?:（[^）]*）|\([^)]*\))?)\s*/u, '')
    value = value.replace(/(^|\s)(?:作者|作\s*者)[:：]\s*[^ ]+/gu, ' ')
    value = value.replace(/(^|\s)(?:来源|信息来源)[:：]\s*[^ ]+/gu, ' ')
    value = value.replace(/(^|\s)(?<![\u4e00-\u9fa5])时间[:：]\s*[^ ]+/gu, ' ')
    value = value.replace(/\s+/g, ' ')
    value = value.replace(/(?<=\d)\s+(?=\d)/g, '')
    value = value.replace(/(?<=\d)\s+(?=[年月日号时分秒点~—\-:：/])/g, '')
    value = value.replace(/(?<=[年月日号时分秒点~—\-:：/])\s+(?=\d)/g, '')
    value = value.replace(/(?<=[:：])\s+(?=\d)/g, '')
    value = value.replace(/(?<=[\u4e00-\u9fa5])\s+(?=(作者|时间|来源|发布日期|发布时间|浏览次数|阅读次数|访问量|点击次数)[:：])/g, ' ')
    value = value.replace(/\s*([，。；：！？])\s*/g, '$1')
    value = value.replace(/\s*([()（）【】《》“”])/g, '$1')
    value = value.replace(/([()（）【】《》“”])\s*/g, '$1')
    return value.trim()
  },

  isListLikeRawLine(text = '') {
    const value = String(text || '').trim()
    if (!value) {
      return false
    }
    return /^((\d+|[一二三四五六七八九十]+)[、.．]|[（(]\d+[)）]|[-•·])/.test(value)
  },

  isAttachmentLikeRawLine(text = '') {
    const value = String(text || '').trim()
    if (!value) {
      return false
    }
    return /^(附件|附：|附\d+[：:]?)/.test(value)
  },

  isStandaloneHeadingLine(text = '') {
    const value = String(text || '').trim()
    if (!value || value.length > 24) {
      return false
    }
    if (/[，。；：:？?！!]/.test(value)) {
      return false
    }
    return /^(申请材料|申请条件|报名流程|申请流程|联系方式|网报方式|复试安排|考核安排|提交材料|个人陈述|推荐信|管理服务系统)$/.test(value)
  },

  mergeBrokenRawContentLines(lines = []) {
    const source = Array.isArray(lines) ? lines.filter(Boolean) : []
    if (source.length === 0) {
      return []
    }

    const merged = []
    source.forEach((line) => {
      const text = String(line || '').trim()
      if (!text) return

      if (merged.length === 0) {
        merged.push(text)
        return
      }

      const prev = merged[merged.length - 1]
      const shouldJoin =
        /^\d{1,4}$/.test(text) ||
        /^[年月日号时分点月-]/.test(text) ||
        /[0-9]$/.test(prev) ||
        prev.length <= 4 ||
        text.length <= 2

      if (shouldJoin) {
        merged[merged.length - 1] = `${prev}${text}`
      } else {
        merged.push(text)
      }
    })

    return merged
  },

  trimRepeatedRawContentBlock(lines = [], title = '') {
    const normalized = Array.isArray(lines) ? lines.filter(Boolean) : []
    if (normalized.length < 8) {
      return this.dedupeConsecutiveLines(
        this.trimRepeatedBlockAfterTitle(normalized, title)
      )
    }

    const anchorSize = Math.min(4, Math.max(3, Math.floor(normalized.length / 6)))
    const anchor = normalized.slice(0, anchorSize)
    let repeatedIndex = -1

    for (let index = anchorSize; index <= normalized.length - anchorSize; index += 1) {
      let matches = true
      for (let offset = 0; offset < anchor.length; offset += 1) {
        if (normalized[index + offset] !== anchor[offset]) {
          matches = false
          break
        }
      }
      if (matches) {
        repeatedIndex = index
        break
      }
    }

    const trimmed = repeatedIndex > 0 ? normalized.slice(0, repeatedIndex) : normalized
    return this.dedupeSemanticParagraphs(
      this.dedupeConsecutiveLines(
        this.trimRepeatedBlockAfterTitle(trimmed, title)
      )
    )
  },

  trimRepeatedBlockAfterTitle(lines = [], title = '') {
    const normalized = Array.isArray(lines) ? lines.filter(Boolean) : []
    if (normalized.length < 6) {
      return normalized
    }

    const titleIndex = normalized.findIndex((line, index) => (
      index > 0 && this.isTitleLikeLine(line, title)
    ))
    if (titleIndex < 2 || titleIndex >= normalized.length - 2) {
      return normalized
    }

    const prefixBeforeTitle = normalized.slice(0, Math.min(4, titleIndex))
    const suffixAfterTitle = normalized.slice(titleIndex + 1, titleIndex + 1 + prefixBeforeTitle.length)
    if (prefixBeforeTitle.length < 2 || suffixAfterTitle.length < 2) {
      return normalized
    }

    let overlapCount = 0
    for (let index = 0; index < Math.min(prefixBeforeTitle.length, suffixAfterTitle.length); index += 1) {
      if (this.isSemanticallyRepeatedLine(prefixBeforeTitle[index], suffixAfterTitle[index])) {
        overlapCount += 1
      }
    }

    if (overlapCount < 2) {
      return normalized
    }

    return normalized.slice(0, titleIndex)
  },

  isTitleLikeLine(line = '', title = '') {
    const text = String(line || '').trim()
    const cleanText = text.replace(/\s+/g, '')
    const cleanTitle = String(title || '').trim().replace(/\s+/g, '')
    if (!cleanText || cleanText.length < 10) {
      return false
    }
    if (cleanTitle && (cleanText === cleanTitle || cleanTitle.includes(cleanText) || cleanText.includes(cleanTitle))) {
      return true
    }
    return /(大学|学院|研究院|研究生院).*(通知|公示|名单|简章|办法|章程|结果|接收|推免|夏令营)/.test(cleanText)
  },

  isSemanticallyRepeatedLine(left = '', right = '') {
    const normalize = (value) => String(value || '')
      .replace(/\s+/g, '')
      .replace(/[0-9０-９]/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[，,。；;：:、!！?？"'“”‘’\-—]/g, '')
      .trim()

    const a = normalize(left)
    const b = normalize(right)
    if (!a || !b) {
      return false
    }
    if (a === b) {
      return true
    }
    if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) {
      return true
    }
    const shorter = a.length <= b.length ? a : b
    const longer = a.length > b.length ? a : b
    if (shorter.length < 6) {
      return false
    }
    return longer.includes(shorter.slice(0, Math.min(shorter.length, 8)))
  },

  dedupeConsecutiveLines(lines = []) {
    const result = []
    lines.forEach((line) => {
      if (!line) return
      if (result.length > 0 && result[result.length - 1] === line) {
        return
      }
      result.push(line)
    })
    return result
  },

  dedupeSemanticParagraphs(lines = []) {
    const source = Array.isArray(lines) ? lines.filter(Boolean) : []
    if (source.length <= 1) {
      return source
    }

    const result = []
    source.forEach((line) => {
      const duplicated = result.some(existing => this.isSemanticallyRepeatedLine(existing, line))
      if (duplicated) {
        return
      }
      result.push(line)
    })
    return this.trimSemanticRepeatedParagraphBlocks(result)
  },

  trimSemanticRepeatedParagraphBlocks(lines = []) {
    const source = Array.isArray(lines) ? lines.filter(Boolean) : []
    if (source.length < 4) {
      return source
    }

    for (let window = Math.min(4, Math.floor(source.length / 2)); window >= 2; window -= 1) {
      for (let start = 0; start <= source.length - window * 2; start += 1) {
        const left = source.slice(start, start + window)
        const right = source.slice(start + window, start + window * 2)
        const repeated = left.every((item, index) => this.isSemanticallyRepeatedLine(item, right[index]))
        if (repeated) {
          return source.slice(0, start + window)
        }
      }
    }

    return source
  },

  normalizeProcessStep(rawStep, index, detail = {}) {
    if (rawStep === null || rawStep === undefined) {
      return null
    }

    if (typeof rawStep === 'string') {
      const action = rawStep.trim()
      if (!action) return null
      const phase = this.inferProcessPhase(action)
      return {
        step: index + 1,
        action,
        phase,
        deadline: '',
        note: '',
        period: ''
      }
    }

    if (typeof rawStep !== 'object') {
      const text = this.toDisplayText(rawStep)
      if (!text) return null
      const phase = this.inferProcessPhase(text)
      return {
        step: index + 1,
        action: text,
        phase,
        deadline: '',
        note: '',
        period: ''
      }
    }

    const action = this.pickFirstText(rawStep, ['action', 'title', 'name', 'step']) || `步骤${index + 1}`
    const deadline = this.pickFirstText(rawStep, ['deadline', 'deadlineAt', 'date', 'time']) || ''
    const note = this.pickFirstText(rawStep, ['note', 'description', 'desc', 'remark']) || ''
    const period = this.pickFirstText(rawStep, ['period', 'timeRange', 'range']) || ''
    const phase = this.inferProcessPhase(`${action} ${note} ${period}`)

    return {
      step: Number(rawStep.step) || index + 1,
      action,
      phase,
      deadline,
      note,
      period
    }
  },

  normalizeContact(rawContact) {
    const source = this.normalizeStructuredData(rawContact, null)
    if (!source) {
      return null
    }

    if (typeof source !== 'object' || Array.isArray(source)) {
      const text = this.toDisplayText(source)
      if (!text) return null
      return {
        email: '',
        phone: '',
        address: '',
        other: [text],
        hasData: true
      }
    }

    const usedKeys = new Set()
    const pick = (...keys) => {
      for (const key of keys) {
        const text = this.toDisplayText(source[key])
        if (text) {
          usedKeys.add(key)
          return text
        }
      }
      return ''
    }

    const email = pick('email', 'mail', '邮箱')
    const phone = pick('phone', 'mobile', 'tel', 'telephone', '电话')
    const address = pick('address', 'location', '地址')
    const other = []

    Object.keys(source).forEach(key => {
      if (usedKeys.has(key)) return
      const text = this.toDisplayText(source[key])
      if (!text) return
      other.push(`${key}: ${text}`)
    })

    const hasData = Boolean(email || phone || address || other.length > 0)
    if (!hasData) {
      return null
    }

    return {
      email,
      phone,
      address,
      other,
      hasData
    }
  },

  decorateProcessTimeline(processList = [], detail = {}) {
    const list = Array.isArray(processList) ? processList : []
    if (list.length === 0) {
      return []
    }
    return list.map((item, index) => {
      return {
        ...item,
        stageStatus: '',
        stageLabel: ''
      }
    })
  },

  shouldUseStructuredProcessTimeline(list = []) {
    if (!Array.isArray(list) || list.length < 2) {
      return false
    }
    const lowQualityCount = list.filter(item => this.isLowQualityProcessStep(item)).length
    return lowQualityCount === 0
  },

  isLowQualityProcessStep(item = {}) {
    const action = this.toDisplayText(item.action)
    const note = this.toDisplayText(item.note)
    const period = this.toDisplayText(item.period)
    const merged = `${action} ${note} ${period}`.trim()

    if (!action) return true
    if (action.length > 32) return true
    if (/https?:\/\/|网址[:：]|登录网址/.test(merged)) return true
    if (/^[”"’，,；;、）)\]]/.test(action) || /[（(“"：:，,；;]$/.test(action)) return true
    if ((merged.match(/[，,；;]/g) || []).length >= 2) return true
    if (/招生简章|考核结果|现接受|补充报名|详见附件|视情况审核/.test(merged)) return true
    return false
  },

  buildProcessFallbackList(list = []) {
    return list
      .map((item) => {
        const parts = [
          this.toDisplayText(item.action),
          this.toDisplayText(item.deadline),
          this.toDisplayText(item.period),
          this.toDisplayText(item.note)
        ].filter(Boolean)
        return parts.join('；')
      })
      .filter(Boolean)
  },

  inferProcessPhase(text = '') {
    const value = String(text || '')
    if (!value) return 'general'

    if (/优秀营员|outstanding/i.test(value)) return 'outstanding'
    if (/入营|录取|名单|结果|公布|通知|admission|result/i.test(value)) return 'result_admission'
    if (/审核|资格审核|材料审核/.test(value)) return 'review'
    if (/夏令营活动|活动|营期|考核|复试|面试|笔试|review|interview/i.test(value)) return 'activity'
    if (/材料|提交|上传|附件|推荐信|简历/.test(value)) return 'material'
    if (/预报名|报名|网申|申请|注册/.test(value)) return 'register'
    return 'general'
  },

  parseTimestamp(value) {
    if (!value) return 0
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return 0
    }
    return parsed.getTime()
  },

  pickFirstText(source = {}, keys = []) {
    for (const key of keys) {
      const value = this.toDisplayText(source[key])
      if (value) {
        return value
      }
    }
    return ''
  },

  toDisplayText(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  },

  getUniversityLogo(universityId, universityName, universityWebsite = '') {
    const localUniversities = wx.getStorageSync('selectedUniversities') || []
    const userSelection = wx.getStorageSync('userSelection') || {}
    const selectionUniversities = userSelection.universities || []
    const all = [].concat(localUniversities, selectionUniversities)
    const matched = all.find(item =>
      (universityId && item.id === universityId) ||
      (universityName && item.name === universityName)
    )
    const explicitLogo = matched?.logo || ''
    if (explicitLogo) {
      return explicitLogo
    }
    const website = String(universityWebsite || matched?.website || '').trim()
    const originMatch = website.match(/^https?:\/\/[^/]+/i)
    return originMatch ? `${originMatch[0]}/favicon.ico` : ''
  },

  sanitizeCampTitle(title = '') {
    const original = String(title || '').trim()
    let text = original
    if (!text) return ''
    const genericPattern = /^(首页|正文|通知公告|硕士招生公示|信息公开|招生信息|招生公告)$/u
    const weakGenericPattern = /^(首页|正文)$/u
    text = text.replace(/^(?:当前您的位置|您当前的位置|当前位置)[:：]?\s*/u, '')
    const parts = text.split(/\s*>\s*/).map(item => item.trim()).filter(Boolean)
    if (parts.length > 1) {
      const meaningfulParts = parts.filter(item => !genericPattern.test(item))
      const fallbackParts = parts.filter(item => !weakGenericPattern.test(item))
      text = meaningfulParts[meaningfulParts.length - 1] || fallbackParts[fallbackParts.length - 1] || parts[parts.length - 1] || text
    }
    text = text.replace(
      /^.+?(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+(?=.{0,80}(?:夏令营|暑期学校|推免|预推免|推荐免试|免试攻读))/u,
      ''
    ).trim()
    text = text.replace(
      /^(?:(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+)+/u,
      ''
    ).trim()
    text = text.replace(/\s*[-|｜_]\s*[^-|｜_]{0,60}(研究生招生网站|研招网|研究生院|招生信息网)$/u, '').trim()
    text = text.replace(weakGenericPattern, '').trim()
    return text || parts?.[parts.length - 2] || original
  },

  buildEventDateText(startDate, endDate) {
    const start = this.toDisplayText(startDate)
    const end = this.toDisplayText(endDate)
    if (start && end) {
      return start === end ? start : `${start} ~ ${end}`
    }
    return start || end || '待定'
  },

  getMockCampDataset() {
    return [
      {
        id: '1',
        universityId: '1',
        universityName: '清华大学',
        title: '计算机学院2026年优秀大学生夏令营',
        announcementType: 'summer_camp',
        publishDate: '2026-02-20',
        deadline: '2026-03-18',
        startDate: '2026-05-10',
        endDate: '2026-05-15',
        location: '北京市海淀区清华大学'
      },
      {
        id: '2',
        universityId: '2',
        universityName: '北京大学',
        title: '软件与微电子学院2026年保研夏令营',
        announcementType: 'summer_camp',
        publishDate: '2026-02-18',
        deadline: '2026-03-22',
        startDate: '2026-05-15',
        endDate: '2026-05-20',
        location: '北京市海淀区燕园校区'
      },
      {
        id: '3',
        universityId: '3',
        universityName: '复旦大学',
        title: 'AI研究院2026年预推免通知',
        announcementType: 'pre_recommendation',
        publishDate: '2026-02-22',
        deadline: '2026-03-12',
        startDate: '',
        endDate: '',
        location: '上海市杨浦区邯郸路校区'
      },
      {
        id: '4',
        universityId: '4',
        universityName: '上海交通大学',
        title: '电子信息与电气工程学院2026年夏令营',
        announcementType: 'summer_camp',
        publishDate: '2026-02-20',
        deadline: '2026-04-05',
        startDate: '2026-05-25',
        endDate: '2026-05-30',
        location: '上海市闵行区东川路校区'
      },
      {
        id: '5',
        universityId: '5',
        universityName: '浙江大学',
        title: '计算机科学与技术学院2026年预推免工作通知',
        announcementType: 'pre_recommendation',
        publishDate: '2026-02-15',
        deadline: '2026-04-10',
        startDate: '',
        endDate: '',
        location: '浙江省杭州市浙大紫金港校区'
      }
    ]
  },

  getMockDetail() {
    const mockList = this.getMockCampDataset()
    const currentCamp = mockList.find(item => String(item.id) === String(this.data.campId)) || mockList[0]
    const isPreRecommendation = currentCamp.announcementType === 'pre_recommendation'
    const logo = this.getUniversityLogo(currentCamp.universityId, currentCamp.universityName)

    const process = isPreRecommendation
      ? [
          { step: 1, action: '网上预报名', deadline: currentCamp.deadline },
          { step: 2, action: '提交预推免材料', deadline: currentCamp.deadline },
          { step: 3, action: '资格审核', note: '预计5个工作日' },
          { step: 4, action: '复试/面试考核', note: '具体安排以学院通知为准' },
          { step: 5, action: '拟录取结果公布', note: '请持续关注学校研究生院通知' }
        ]
      : [
          { step: 1, action: '网上报名', deadline: currentCamp.deadline },
          { step: 2, action: '提交材料', deadline: currentCamp.deadline },
          { step: 3, action: '等待审核', note: '预计7个工作日' },
          { step: 4, action: '夏令营活动', period: `${currentCamp.startDate || '待定'}至${currentCamp.endDate || '待定'}` },
          { step: 5, action: '结果通知', note: '活动结束后一周内' }
        ]

    return {
      id: currentCamp.id,
      universityId: currentCamp.universityId,
      universityName: currentCamp.universityName,
      universityLogo: logo,
      title: currentCamp.title,
      announcementType: currentCamp.announcementType,
      sourceUrl: `https://example.com/camp/${currentCamp.id}`,
      publishDate: currentCamp.publishDate,
      deadline: currentCamp.deadline,
      startDate: currentCamp.startDate,
      endDate: currentCamp.endDate,
      location: currentCamp.location,
      requirements: {
        education: '本科在读',
        gpa: '前30%',
        english: 'CET-6 450分以上',
        major: '计算机相关专业',
        other: ['有科研经历优先', '有竞赛获奖优先']
      },
      materials: [
        '个人简历',
        '成绩单',
        '英语成绩证明',
        '获奖证书',
        '推荐信',
        '个人陈述',
        '研究计划'
      ],
      process,
      contact: {
        email: 'admission@cs.tsinghua.edu.cn',
        phone: '010-12345678',
        address: '北京市海淀区清华大学计算机科学与技术系'
      },
      progressChangeEvents: [
        {
          id: `mock_change_${currentCamp.id}_1`,
          eventType: 'deadline',
          fieldName: 'deadline',
          oldValue: '2026-03-15',
          newValue: currentCamp.deadline,
          sourceType: 'crawler',
          sourceUrl: `https://example.com/camp/${currentCamp.id}`,
          sourceUpdatedAt: '2026-03-01T10:00:00.000Z',
          confidenceLabel: 'high',
          confidenceScore: 0.86,
          changedAt: '2026-03-01T10:01:00.000Z'
        },
        {
          id: `mock_change_${currentCamp.id}_2`,
          eventType: 'materials',
          fieldName: 'materials',
          oldValue: '["个人简历","成绩单","推荐信"]',
          newValue: '["个人简历","成绩单","推荐信","英语成绩证明"]',
          sourceType: 'crawler',
          sourceUrl: `https://example.com/camp/${currentCamp.id}`,
          sourceUpdatedAt: '2026-03-01T10:00:00.000Z',
          confidenceLabel: 'medium',
          confidenceScore: 0.74,
          changedAt: '2026-03-01T10:01:30.000Z'
        }
      ],
      latestExtraction: {
        id: `extract_mock_${currentCamp.id}`,
        provider: 'deepseek',
        model: 'deepseek-chat',
        extractionVersion: 'deepseek-fallback-v1',
        confidenceScore: 0.84,
        status: 'success',
        triggerReasons: ['missing_requirements'],
        createdAt: '2026-03-01T10:00:00.000Z'
      },
      lastCrawledAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:02:00.000Z',
      status: 'published',
      hasReminder: false,
      hasProgress: false
    }
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    return Boolean(baseUrl)
  },

  hasAuthToken() {
    return Boolean(wx.getStorageSync('token'))
  },

  shouldUseRemoteProgressApi() {
    return this.shouldUseRemoteCampApi() && this.hasAuthToken()
  },

  handleUniversityLogoError() {
    if (!this.data.campDetail?.universityLogo) {
      return
    }
    this.setData({
      'campDetail.universityLogo': ''
    })
  },

  refreshProfileComparison() {
    const detail = this.data.campDetail || {}
    if (!detail.id || this.data.loading) {
      return
    }
    const nextRequirements = this.normalizeRequirements(detail.requirements, detail.confidence)
    const nextComparison = nextRequirements?.profileComparison || this.buildProfileComparison([], this.getStudentProfile())
    this.setData({
      'campDetail.requirements': nextRequirements,
      'campDetail.profileComparison': nextComparison
    })
  },

  async syncFollowStateOnShow() {
    const campId = this.data.campDetail?.id || this.data.campId
    if (!campId) return

    const latestToken = Number(wx.getStorageSync(PROGRESS_FOLLOW_REFRESH_TOKEN_KEY) || 0)
    const previousToken = Number(this.data.lastProgressFollowRefreshToken || 0)
    if (latestToken <= previousToken) {
      return
    }

    this.setData({
      lastProgressFollowRefreshToken: latestToken
    })

    try {
      const progressState = await this.resolveProgressState(campId)
      const reminderCampIds = wx.getStorageSync('reminderCampIds') || []
      const hasReminder = Array.isArray(reminderCampIds)
        ? reminderCampIds.includes(campId)
        : false
      const nextCampDetail = {
        ...this.data.campDetail,
        hasProgress: Boolean(progressState.status),
        hasReminder,
        progressId: progressState.progressId || '',
        progressStatus: progressState.status || '',
        progressStatusLabel: progressState.statusLabel || ''
      }
      nextCampDetail.process = this.decorateProcessTimeline(nextCampDetail.process, nextCampDetail)
      this.setData({ campDetail: nextCampDetail })
    } catch (error) {
      // 同步失败时保持当前显示状态
    }
  },

  touchProgressFollowRefreshToken() {
    const token = Date.now()
    wx.setStorageSync(PROGRESS_FOLLOW_REFRESH_TOKEN_KEY, token)
    this.setData({ lastProgressFollowRefreshToken: token })
  },

  onJumpSection(event) {
    const target = event?.currentTarget?.dataset?.target
    if (!target) return
    wx.pageScrollTo({
      selector: `#${target}`,
      duration: 260
    })
  },

  onToggleExpand(event) {
    const key = event?.currentTarget?.dataset?.key
    if (!key) return
    this.setData({
      [key]: !this.data[key]
    })
  },

  handleGoProfile() {
    wx.navigateTo({
      url: '/packageProfile/pages/profile/index'
    })
  },

  handleSetReminder() {
    // 设置提醒
    const { campDetail } = this.data;
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?campId=${campDetail.id}&title=${encodeURIComponent(campDetail.title)}&deadline=${campDetail.deadline}&universityName=${encodeURIComponent(campDetail.universityName)}`
    });
  },

  async handleToggleProgress() {
    if (this.data.campDetail.hasProgress) {
      await this.handleRemoveFromProgress()
      return
    }
    await this.handleAddToProgress()
  },

  async handleAddToProgress() {
    const campId = this.data.campDetail.id
    if (!campId) return

    wx.showLoading({ title: '处理中...' })

    try {
      if (this.shouldUseRemoteProgressApi()) {
        await progressService.createProgress({ campId }, {
          showLoading: false,
          showError: false
        })
        const nextCampDetail = {
          ...this.data.campDetail,
          hasProgress: true,
          progressStatus: 'followed',
          progressStatusLabel: PROGRESS_STATUS_LABELS.followed
        }
        nextCampDetail.process = this.decorateProcessTimeline(nextCampDetail.process, nextCampDetail)
        this.setData({
          campDetail: nextCampDetail
        })
        this.touchProgressFollowRefreshToken()
        this.showFollowAddedNotice()
        return
      }
    } catch (error) {
      // 远端失败时走本地兜底
    } finally {
      wx.hideLoading()
    }

    const fallbackList = wx.getStorageSync('progressFallbackList') || []
    const existed = fallbackList.find(item => item.campId === campId)

    if (!existed) {
      fallbackList.unshift({
        id: `local_${Date.now()}`,
        campId,
        status: 'followed',
        statusText: '已关注',
        nextAction: '开始整理报名材料',
        campTitle: this.data.campDetail.title,
        universityName: this.data.campDetail.universityName,
        deadlineText: this.data.campDetail.deadline || '待定',
        updatedAtText: new Date().toLocaleString(),
        subscriptionEnabled: true
      })
      wx.setStorageSync('progressFallbackList', fallbackList)
    }

    const nextCampDetail = {
      ...this.data.campDetail,
      hasProgress: true,
      progressStatus: 'followed',
      progressStatusLabel: PROGRESS_STATUS_LABELS.followed
    }
    nextCampDetail.process = this.decorateProcessTimeline(nextCampDetail.process, nextCampDetail)
    this.setData({ campDetail: nextCampDetail })
    this.touchProgressFollowRefreshToken()
    this.showFollowAddedNotice()
  },

  async handleRemoveFromProgress() {
    const campId = this.data.campDetail.id
    if (!campId) return

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '取消关注',
        content: '取消后将停止该公告的关注与提醒，你可后续再次加入关注。',
        confirmText: '确认取消',
        cancelText: '继续关注',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      })
    })

    if (!confirm) return

    wx.showLoading({ title: '处理中...' })
    try {
      if (this.shouldUseRemoteProgressApi()) {
        await progressService.unfollowCamp(campId, {
          showLoading: false,
          showError: false
        })
      }

      this.syncLocalFollowRemoval(campId)
      const nextCampDetail = {
        ...this.data.campDetail,
        hasProgress: false,
        hasReminder: false,
        progressId: '',
        progressStatus: '',
        progressStatusLabel: ''
      }
      nextCampDetail.process = this.decorateProcessTimeline(nextCampDetail.process, nextCampDetail)
      this.setData({ campDetail: nextCampDetail })
      this.touchProgressFollowRefreshToken()
      wx.showToast({ title: '已取消关注', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '取消关注失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  syncLocalFollowRemoval(campId) {
    const normalizedCampId = String(campId || '')
    const fallbackList = wx.getStorageSync('progressFallbackList') || []
    const nextFallbackList = Array.isArray(fallbackList)
      ? fallbackList.filter((item) => String(item?.campId || '') !== normalizedCampId)
      : []
    wx.setStorageSync('progressFallbackList', nextFallbackList)

    const reminderCampIds = wx.getStorageSync('reminderCampIds') || []
    const nextReminderCampIds = Array.isArray(reminderCampIds)
      ? reminderCampIds.filter((id) => String(id || '') !== normalizedCampId)
      : []
    wx.setStorageSync('reminderCampIds', nextReminderCampIds)
    wx.setStorageSync(REMINDER_REFRESH_TOKEN_KEY, Date.now())
    wx.setStorageSync(PROGRESS_FOLLOW_REFRESH_TOKEN_KEY, Date.now())
  },

  showFollowAddedNotice() {
    wx.showModal({
      title: '已添加关注',
      content: '已添加关注，并默认开启该公告的全部通知开关。后续入营名单、结果与关键信息变更会自动提醒，可在“关注与订阅”中单独调整。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  handleCopyMaterials() {
    // 复制材料清单
    const materials = this.data.campDetail.materials;
    const materialsText = materials.map(item => {
      if (typeof item === 'string') return item
      if (!item) return ''
      return item.detail ? `${item.title}: ${item.detail}` : item.title
    }).filter(Boolean).join('\n');
    
    wx.setClipboardData({
      data: materialsText,
      success: () => {
        this.setData({ showCopySuccess: true });
        setTimeout(() => {
          this.setData({ showCopySuccess: false });
        }, 2000);
      }
    });
  },

  handleOpenSourceUrl() {
    this.handleCopySourceUrl()
  },

  handleCopySourceUrl() {
    const { sourceUrl } = this.data.campDetail;
    if (!sourceUrl) {
      wx.showToast({
        title: '原文链接缺失',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: sourceUrl,
      success: () => {
        wx.showToast({
          title: '已复制原文链接',
          icon: 'none'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制链接失败，请稍后重试',
          icon: 'none'
        });
      },
    });
  },

  enrichMaterials(materials, linkedMaterialTitles = []) {
    const presets = {
      '个人简历': '包含教育背景、科研/项目/竞赛经历、技能与荣誉。',
      '成绩单': '大一至当前的完整成绩单，需学校盖章或教务系统证明。',
      '英语成绩证明': '四/六级、专业英语考试、托福或雅思等成绩单任选其一。',
      '获奖证书': '学科竞赛、奖学金、荣誉称号等复印件或扫描件。',
      '推荐信': '1-2封，推荐人联系方式需清晰可核验。',
      '个人陈述': '学习与科研经历、申请动机、未来规划。',
      '研究计划': '拟研究方向、问题、方法与预期成果（简要）。'
    }

    const linkedSet = new Set((linkedMaterialTitles || []).map(item => this.toDisplayText(item)))
    return materials.map(item => {
      if (!item) return null
      if (typeof item === 'string') {
        const linkedBy = this.matchMaterialLink(item, linkedSet)
        return {
          title: item,
          detail: presets[item] || '',
          isHighlighted: linkedBy.matched,
          highlightReason: linkedBy.reason
        }
      }
      const title = item.title || item.name || ''
      const linkedBy = this.matchMaterialLink(title, linkedSet)
      return {
        title,
        detail: item.detail || item.description || presets[title] || '',
        isHighlighted: linkedBy.matched,
        highlightReason: linkedBy.reason
      }
    }).filter(Boolean)
  },

  matchMaterialLink(title = '', linkedSet = new Set()) {
    const normalized = this.toDisplayText(title)
    if (!normalized) {
      return { matched: false, reason: '' }
    }
    if (linkedSet.has(normalized)) {
      return { matched: true, reason: '申请条件已提及此材料' }
    }
    const linkedArray = Array.from(linkedSet)
    const fuzzy = linkedArray.find(item =>
      normalized.indexOf(item) > -1 || item.indexOf(normalized) > -1
    )
    if (fuzzy) {
      return { matched: true, reason: `申请条件关联：${fuzzy}` }
    }
    return { matched: false, reason: '' }
  },

  buildRiskHints(detail = {}) {
    const hints = []
    const requirements = detail.requirements || {}
    const hardConstraints = Array.isArray(requirements.hardConstraints) ? requirements.hardConstraints : []
    const uncertainItems = Array.isArray(requirements.uncertainItems) ? requirements.uncertainItems : []

    const hasEnglishRule = hardConstraints.some(item => /英语|cet|六级|雅思|托福/i.test(`${item.title} ${item.content}`))
    if (!hasEnglishRule) {
      hints.push({
        type: 'warning',
        title: '英语门槛未明确',
        content: '建议尽快向学院确认英语要求。'
      })
    }

    if (!detail.deadline) {
      hints.push({
        type: 'high',
        title: '截止时间待定',
        content: '建议开启提醒并每日复核官网公告。'
      })
    }

    if (uncertainItems.length > 0) {
      hints.push({
        type: 'warning',
        title: '存在不确定表述',
        content: '出现“择优/另行通知”等措辞，建议按高标准准备。'
      })
    }

    if (!detail.showProcessSection) {
      hints.push({
        type: 'warning',
        title: '流程摘要未展示',
        content: '当前流程结构化置信度不足，请直接查看官网原文。'
      })
    }

    if (!detail.contact || !detail.contact.hasData) {
      hints.push({
        type: 'warning',
        title: '联系方式不完整',
        content: '建议到学院官网补充确认咨询渠道。'
      })
    }

    return hints.slice(0, 4)
  },

  buildTransparencyMeta(detail = {}) {
    const confidenceScore = this.normalizeConfidence(detail.confidence)
    const crawledAt = detail.lastCrawledAt || detail.updatedAt || ''
    const updatedAt = detail.updatedAt || ''
    return {
      sourceUrl: detail.sourceUrl || '',
      crawledAtText: this.formatDateTime(crawledAt),
      updatedAtText: this.formatDateTime(updatedAt),
      confidenceScore,
      confidenceLabel: this.getConfidenceLabel(confidenceScore),
      confidenceDescription: '当前页面展示的是高置信智能摘要，具体内容请以官网原文为准'
    }
  },

  getConfidenceLabel(score = 0) {
    if (score >= 0.8) return '高'
    if (score >= 0.55) return '中'
    return '低'
  },

  normalizeDisplayDate(value) {
    if (!value) return ''
    const timestamp = this.parseTimestamp(value)
    if (!timestamp) return this.toDisplayText(value)
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  formatDateTime(value) {
    const timestamp = this.parseTimestamp(value)
    if (!timestamp) return '待补充'
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * MVP β-场景：用户报告公告字段错误
   * 点击"信息有误"→ 弹出问题类型选择 → 提交到后端 → 标红进复核台
   */
  onTapReportIssue() {
    const campId = this.data.campId || (this.data.campDetail && this.data.campDetail.id)
    if (!campId) {
      wx.showToast({ title: '公告ID缺失', icon: 'none' })
      return
    }
    const issueOptions = [
      { label: '截止日期不对', value: 'deadline_wrong' },
      { label: '材料清单不全', value: 'materials_missing' },
      { label: '报考条件错误', value: 'requirements_wrong' },
      { label: '原文链接打不开', value: 'link_dead' },
      { label: '正文内容错乱', value: 'content_wrong' },
      { label: '不是夏令营/推免公告', value: 'off_topic' },
      { label: '其他问题', value: 'other' }
    ]
    wx.showActionSheet({
      itemList: issueOptions.map(o => o.label),
      success: (res) => {
        const chosen = issueOptions[res.tapIndex]
        if (!chosen) return
        this.submitFeedback(campId, chosen.value, chosen.label)
      }
    })
  },

  async submitFeedback(campId, issueType, label) {
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await campService.submitFeedback(campId, { issueType })
      wx.hideLoading()
      wx.showModal({
        title: '已收到反馈',
        content: `感谢您反馈"${label}"，我们 48 小时内人工核对。修复后会再次推送通知。`,
        showCancel: false,
        confirmText: '好的'
      })
    } catch (err) {
      wx.hideLoading()
      const msg = (err && (err.message || err.errMsg)) || '提交失败，请稍后重试'
      wx.showToast({ title: msg, icon: 'none', duration: 2500 })
    }
  },
});
