import { userService } from '../../services/user'
import { http } from '../../../services/http'

const STORAGE_KEYS = ['baoyanStudentProfile', 'studentProfile', 'userProfile']
const SCHOOL_LEVEL_OPTIONS = ['985', '211', '双一流', '普通一本', '普通二本', '专科', '其他']
const SUBJECT_RANKING_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', '未上榜', '不确定']
const COMMON_UNIVERSITIES = [
  { name: '清华大学', level: '985' },
  { name: '北京大学', level: '985' },
  { name: '复旦大学', level: '985' },
  { name: '上海交通大学', level: '985' },
  { name: '浙江大学', level: '985' },
  { name: '中国科学技术大学', level: '985' },
  { name: '南京大学', level: '985' },
  { name: '同济大学', level: '985' },
  { name: '武汉大学', level: '985' },
  { name: '华中科技大学', level: '985' },
  { name: '西安交通大学', level: '985' },
  { name: '哈尔滨工业大学', level: '985' },
  { name: '北京航空航天大学', level: '985' },
  { name: '中山大学', level: '985' },
  { name: '南开大学', level: '985' }
]

const DEFAULT_FORM = {
  schoolName: '',
  schoolLevel: '其他',
  education: '本科在读',
  major: '',
  rankPercent: '',
  rankText: '',
  gpa: '',
  englishType: 'cet6',
  englishScore: '',
  subjectRanking: '不确定',
  researchExperience: 'unknown',
  competitionAwards: 'unknown',
  preferredDirection: '',
  targetNote: ''
}

Page({
  data: {
    loading: true,
    saving: false,
    remoteEnabled: false,
    form: { ...DEFAULT_FORM },
    schoolKeyword: '',
    schoolSuggestions: [],
    schoolLevelOptions: SCHOOL_LEVEL_OPTIONS,
    subjectRankingOptions: SUBJECT_RANKING_OPTIONS,
    educationOptions: ['本科在读', '本科毕业', '硕士在读', '其他'],
    englishTypeOptions: [
      { label: '不填写', value: 'none' },
      { label: 'CET-4', value: 'cet4' },
      { label: 'CET-6', value: 'cet6' },
      { label: 'IELTS', value: 'ielts' },
      { label: 'TOEFL', value: 'toefl' },
      { label: '其他', value: 'other' }
    ],
    researchOptions: [
      { label: '未填写', value: 'unknown' },
      { label: '无科研经历', value: 'none' },
      { label: '有基础科研', value: 'basic' },
      { label: '科研经历较丰富', value: 'rich' }
    ],
    competitionOptions: [
      { label: '未填写', value: 'unknown' },
      { label: '无获奖', value: 'none' },
      { label: '校级获奖', value: 'school' },
      { label: '省级获奖', value: 'province' },
      { label: '国家级获奖', value: 'national' }
    ],
    rankQuickOptions: [5, 10, 15, 20, 30],
    completionText: '已填写 0/4 项',
    completionStatus: 'empty'
  },

  onLoad() {
    this.initPage()
  },

  async initPage() {
    const localProfile = this.prefillWithSelection(this.readLocalProfile())
    const nextForm = this.mergeForm(localProfile)
    const remoteEnabled = this.shouldUseRemoteUserApi()

    this.setData({
      form: nextForm,
      remoteEnabled,
      loading: false
    })
    this.updateCompletion(nextForm)

    if (remoteEnabled) {
      await this.loadRemoteProfile()
    }
  },

  shouldUseRemoteUserApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    if (!baseUrl || baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return true
  },

  prefillWithSelection(profile = null) {
    const base = profile && typeof profile === 'object' ? { ...profile } : {}
    if (base.schoolName) {
      return base
    }
    const selectedUniversities = wx.getStorageSync('selectedUniversities') || []
    if (Array.isArray(selectedUniversities) && selectedUniversities.length > 0) {
      base.schoolName = selectedUniversities[0].name || ''
      base.schoolLevel = selectedUniversities[0].level || ''
    }
    return base
  },

  readLocalProfile() {
    for (const key of STORAGE_KEYS) {
      const raw = wx.getStorageSync(key)
      if (!raw) continue
      if (typeof raw === 'object') {
        return raw
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            return parsed
          }
        } catch (error) {
          // ignore
        }
      }
    }
    return null
  },

  async loadRemoteProfile() {
    try {
      const result = await userService.getStudentProfile({
        showLoading: false,
        showError: false
      })
      if (!result?.profile) {
        return
      }
      const merged = this.mergeForm(result.profile)
      this.persistLocalProfile({
        ...result.profile,
        rankPercent: this.toNumberOrNull(result.profile.rankPercent),
        englishScore: this.toNumberOrNull(result.profile.englishScore),
        updatedAt: result.profile.updatedAt || new Date().toISOString()
      })
      this.setData({ form: merged })
      this.updateCompletion(merged)
    } catch (error) {
      // ignore remote errors and keep local profile
    }
  },

  mergeForm(profile = {}) {
    const source = profile && typeof profile === 'object' ? profile : {}
    return {
      ...DEFAULT_FORM,
      schoolName: this.toText(source.schoolName),
      schoolLevel: this.normalizeSchoolLevelChoice(source.schoolLevel),
      education: this.toText(source.education) || DEFAULT_FORM.education,
      major: this.toText(source.major),
      rankPercent: this.toNumberText(source.rankPercent),
      rankText: this.toText(source.rankText),
      gpa: this.toText(source.gpa),
      englishType: this.toText(source.englishType) || DEFAULT_FORM.englishType,
      englishScore: this.toNumberText(source.englishScore),
      subjectRanking: this.normalizeSubjectRanking(source.subjectRanking),
      researchExperience: this.toText(source.researchExperience) || DEFAULT_FORM.researchExperience,
      competitionAwards: this.toText(source.competitionAwards) || DEFAULT_FORM.competitionAwards,
      preferredDirection: this.toText(source.preferredDirection),
      targetNote: this.toText(source.targetNote)
    }
  },

  normalizeSchoolLevelChoice(value) {
    const text = this.toText(value)
    if (!text) return DEFAULT_FORM.schoolLevel
    if (SCHOOL_LEVEL_OPTIONS.indexOf(text) > -1) return text
    if (text.indexOf('985') > -1) return '985'
    if (text.indexOf('211') > -1) return '211'
    if (text.indexOf('双一流') > -1) return '双一流'
    if (text.indexOf('一本') > -1) return '普通一本'
    if (text.indexOf('二本') > -1) return '普通二本'
    if (text.indexOf('专科') > -1) return '专科'
    if (text.indexOf('普通') > -1) return '普通一本'
    return '其他'
  },

  normalizeSubjectRanking(value) {
    const text = this.toText(value)
    if (!text) return DEFAULT_FORM.subjectRanking
    if (SUBJECT_RANKING_OPTIONS.indexOf(text) > -1) return text
    return DEFAULT_FORM.subjectRanking
  },

  toText(value) {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  },

  toNumberText(value) {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return ''
    return String(num)
  },

  toNumberOrNull(value) {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return null
    return num
  },

  updateCompletion(form = this.data.form) {
    const filled = [
      this.toText(form.education),
      this.toText(form.major),
      this.toNumberOrNull(form.rankPercent),
      this.toNumberOrNull(form.englishScore)
    ].filter(value => value !== null && value !== '').length
    const completionStatus = filled === 0 ? 'empty' : (filled === 4 ? 'complete' : 'partial')
    this.setData({
      completionText: `已填写 ${filled}/4 项`,
      completionStatus
    })
  },

  getCurrentForm() {
    return { ...this.data.form }
  },

  patchForm(patch = {}) {
    const nextForm = {
      ...this.getCurrentForm(),
      ...patch
    }
    this.setData({ form: nextForm })
    this.updateCompletion(nextForm)
  },

  onInputField(event) {
    const field = event?.currentTarget?.dataset?.field
    if (!field) return
    this.patchForm({
      [field]: event.detail.value
    })
  },

  onSchoolFocus() {
    const keyword = this.data.schoolKeyword || this.data.form.schoolName || ''
    this.searchSchoolSuggestions(keyword)
  },

  onSchoolInput(event) {
    const keyword = this.toText(event.detail.value)
    this.patchForm({ schoolName: keyword })
    this.setData({ schoolKeyword: keyword })
    this.searchSchoolSuggestions(keyword)
  },

  onPickSchoolSuggestion(event) {
    const name = this.toText(event?.currentTarget?.dataset?.name)
    const level = this.normalizeSchoolLevelChoice(event?.currentTarget?.dataset?.level)
    if (!name) return
    this.patchForm({
      schoolName: name,
      schoolLevel: level
    })
    this.setData({
      schoolKeyword: name,
      schoolSuggestions: []
    })
  },

  onChooseSchoolLevel(event) {
    const level = this.normalizeSchoolLevelChoice(event?.currentTarget?.dataset?.value)
    this.patchForm({ schoolLevel: level })
  },

  onChooseSubjectRanking(event) {
    const value = this.normalizeSubjectRanking(event?.currentTarget?.dataset?.value)
    this.patchForm({ subjectRanking: value })
  },

  buildLocalSchoolPool() {
    const pool = []
    const pushItem = (name, level) => {
      const title = this.toText(name)
      if (!title) return
      pool.push({
        name: title,
        level: this.normalizeSchoolLevelChoice(level)
      })
    }

    COMMON_UNIVERSITIES.forEach(item => pushItem(item.name, item.level))
    const selectedUniversities = wx.getStorageSync('selectedUniversities') || []
    selectedUniversities.forEach(item => pushItem(item.name, item.level))
    const userSelection = wx.getStorageSync('userSelection') || {}
    const universities = userSelection.universities || []
    universities.forEach(item => pushItem(item.name, item.level))

    const dedup = []
    const seen = new Set()
    pool.forEach(item => {
      if (seen.has(item.name)) return
      seen.add(item.name)
      dedup.push(item)
    })
    return dedup
  },

  async searchSchoolSuggestions(rawKeyword = '') {
    const keyword = this.toText(rawKeyword)
    const localPool = this.buildLocalSchoolPool()
    const localMatched = keyword
      ? localPool.filter(item => item.name.indexOf(keyword) > -1).slice(0, 12)
      : localPool.slice(0, 8)

    this.setData({ schoolSuggestions: localMatched })

    if (!this.data.remoteEnabled || keyword.length < 2) {
      return
    }

    const currentKeyword = keyword
    this._schoolSearchSeq = (this._schoolSearchSeq || 0) + 1
    const seq = this._schoolSearchSeq

    try {
      const result = await http.get('/universities', {
        page: 1,
        limit: 12,
        keyword: currentKeyword,
        sortBy: 'name',
        sortOrder: 'asc'
      }, {
        showLoading: false,
        showError: false
      })
      if (seq !== this._schoolSearchSeq) {
        return
      }
      const remoteList = Array.isArray(result?.data) ? result.data : []
      const merged = localMatched.slice()
      const seen = new Set(merged.map(item => item.name))
      remoteList.forEach(item => {
        const name = this.toText(item?.name)
        if (!name || seen.has(name)) return
        seen.add(name)
        merged.push({
          name,
          level: this.normalizeSchoolLevelChoice(item?.level)
        })
      })
      this.setData({ schoolSuggestions: merged.slice(0, 12) })
    } catch (error) {
      // ignore
    }
  },

  onEducationChange(event) {
    const index = Number(event.detail.value || 0)
    const selected = this.data.educationOptions[index] || DEFAULT_FORM.education
    this.patchForm({ education: selected })
  },

  onEnglishTypeChange(event) {
    const index = Number(event.detail.value || 0)
    const selected = this.data.englishTypeOptions[index]?.value || DEFAULT_FORM.englishType
    this.patchForm({ englishType: selected })
  },

  onQuickRank(event) {
    const rank = event?.currentTarget?.dataset?.rank
    if (!rank) return
    this.patchForm({ rankPercent: String(rank) })
  },

  onSelectResearch(event) {
    const value = event?.currentTarget?.dataset?.value || 'unknown'
    this.patchForm({ researchExperience: value })
  },

  onSelectCompetition(event) {
    const value = event?.currentTarget?.dataset?.value || 'unknown'
    this.patchForm({ competitionAwards: value })
  },

  validateForm(form) {
    if (!this.toText(form.education)) {
      wx.showToast({ title: '请选择学历层次', icon: 'none' })
      return false
    }
    if (!this.toText(form.major)) {
      wx.showToast({ title: '请填写当前专业', icon: 'none' })
      return false
    }
    const rank = this.toNumberOrNull(form.rankPercent)
    if (rank !== null && (rank < 0 || rank > 100)) {
      wx.showToast({ title: '排名百分比应在 0-100 之间', icon: 'none' })
      return false
    }
    const english = this.toNumberOrNull(form.englishScore)
    if (english !== null && english > 999) {
      wx.showToast({ title: '英语分数格式不正确', icon: 'none' })
      return false
    }
    return true
  },

  buildPayload(form) {
    return {
      schoolName: this.toText(form.schoolName) || undefined,
      schoolLevel: this.normalizeSchoolLevelChoice(form.schoolLevel),
      education: this.toText(form.education) || undefined,
      major: this.toText(form.major) || undefined,
      rankPercent: this.toNumberOrNull(form.rankPercent) ?? undefined,
      rankText: this.toText(form.rankText) || undefined,
      gpa: this.toText(form.gpa) || undefined,
      englishType: this.toText(form.englishType) || 'none',
      englishScore: this.toNumberOrNull(form.englishScore) ?? undefined,
      subjectRanking: this.normalizeSubjectRanking(form.subjectRanking),
      researchExperience: this.toText(form.researchExperience) || 'unknown',
      competitionAwards: this.toText(form.competitionAwards) || 'unknown',
      preferredDirection: this.toText(form.preferredDirection) || undefined,
      targetNote: this.toText(form.targetNote) || undefined
    }
  },

  persistLocalProfile(profile = {}) {
    STORAGE_KEYS.forEach((key) => {
      wx.setStorageSync(key, profile)
    })
  },

  async handleSave() {
    if (this.data.saving) return
    const form = this.getCurrentForm()
    if (!this.validateForm(form)) return

    const payload = this.buildPayload(form)
    const localProfile = {
      ...payload,
      rankPercent: payload.rankPercent ?? null,
      englishScore: payload.englishScore ?? null,
      updatedAt: new Date().toISOString()
    }

    this.setData({ saving: true })
    this.persistLocalProfile(localProfile)

    let savedByRemote = false
    if (this.data.remoteEnabled) {
      try {
        const result = await userService.updateStudentProfile(payload, {
          showLoading: false,
          showError: false
        })
        if (result?.profile) {
          const remoteProfile = {
            ...result.profile,
            updatedAt: result.profile.updatedAt || localProfile.updatedAt
          }
          this.persistLocalProfile(remoteProfile)
          this.setData({
            form: this.mergeForm(remoteProfile)
          })
          this.updateCompletion(this.mergeForm(remoteProfile))
          savedByRemote = true
        }
      } catch (error) {
        // remote failed: local save still valid
      }
    }

    this.setData({ saving: false })
    wx.showToast({
      title: savedByRemote ? '档案已保存' : '已保存到本地',
      icon: 'success'
    })
  },

  handleReset() {
    wx.showModal({
      title: '重置档案',
      content: '确认清空当前填写内容？',
      success: (res) => {
        if (!res.confirm) return
        const nextForm = this.mergeForm(this.prefillWithSelection(null))
        this.setData({ form: nextForm })
        this.updateCompletion(nextForm)
      }
    })
  }
})
