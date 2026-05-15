import { profileV2Service } from '../../../services/profile-v2'

const COMMON_MAJORS = [
  '计算机科学与技术', '人工智能', '软件工程', '电子信息工程', '通信工程',
  '集成电路', '自动化', '数学与应用数学', '统计学', '物理学', '化学',
  '生物科学', '材料科学与工程', '机械工程',
  '经济学', '金融学', '工商管理', '会计学',
  '法学', '新闻学', '心理学', '社会学'
]

const ENGLISH_TYPES = ['CET4', 'CET6', 'TOEFL', 'IELTS', 'GRE']

Page({
  data: {
    form: {
      schoolName: '',
      schoolLevel: '',
      major: '',
      gpa: '',
      gradeRankPercent: '',
      englishType: '',
      englishScore: '',
      researchExperience: '',
      competitionAwards: '',
      targetMajors: [],
      targetMajorsSet: {},
      customMajors: '',
      completeness: 0
    },
    commonMajors: COMMON_MAJORS,
    englishTypes: ENGLISH_TYPES,
    englishTypeIndex: 0,
    completenessHint: '',
    saving: false
  },

  onLoad() {
    this.loadProfile()
  },

  async loadProfile() {
    try {
      const profile = await profileV2Service.get()
      if (!profile?.exists) return
      const targetMajors = profile.targetMajors || []
      const customMajors = targetMajors
        .filter(m => !COMMON_MAJORS.includes(m))
        .join('、')
      const targetMajorsSet = {}
      targetMajors.forEach(m => { targetMajorsSet[m] = true })

      const englishTypeIndex = Math.max(0, ENGLISH_TYPES.indexOf(profile.englishType))

      this.setData({
        form: {
          schoolName: profile.schoolName || '',
          schoolLevel: profile.schoolLevel || '',
          major: profile.major || '',
          gpa: profile.gpa || '',
          gradeRankPercent: profile.gradeRankPercent != null ? String(profile.gradeRankPercent) : '',
          englishType: profile.englishType || '',
          englishScore: profile.englishScore != null ? String(profile.englishScore) : '',
          researchExperience: profile.researchExperience || '',
          competitionAwards: profile.competitionAwards || '',
          targetMajors,
          targetMajorsSet,
          customMajors,
          completeness: profile.completeness || 0
        },
        englishTypeIndex,
        completenessHint: this.makeHint(profile.completeness || 0)
      })
    } catch (err) {
      // ignore
    }
  },

  makeHint(c) {
    if (c >= 80) return '档案完整度高，AI 判断会很精准'
    if (c >= 50) return '建议补全英语成绩和目标专业'
    return '至少填完"基本信息"和"目标专业"才能用 AI 助理'
  },

  // ============ 输入处理 ============
  onInputSchool(e) { this.setForm({ schoolName: e.detail.value }) },
  onInputMajor(e) { this.setForm({ major: e.detail.value }) },
  onInputGpa(e) { this.setForm({ gpa: e.detail.value }) },
  onInputRankPercent(e) { this.setForm({ gradeRankPercent: e.detail.value }) },
  onPickEnglishType(e) {
    const idx = parseInt(e.detail.value, 10) || 0
    this.setData({ englishTypeIndex: idx })
    this.setForm({ englishType: ENGLISH_TYPES[idx] })
  },
  onInputEnglishScore(e) { this.setForm({ englishScore: e.detail.value }) },
  onInputResearch(e) { this.setForm({ researchExperience: e.detail.value }) },
  onInputAwards(e) { this.setForm({ competitionAwards: e.detail.value }) },
  onInputCustomMajors(e) { this.setForm({ customMajors: e.detail.value }) },

  onToggleMajor(e) {
    const major = e.currentTarget.dataset.major
    const set = { ...this.data.form.targetMajorsSet }
    if (set[major]) delete set[major]
    else set[major] = true
    const list = this.data.form.targetMajors.includes(major)
      ? this.data.form.targetMajors.filter(m => m !== major)
      : [...this.data.form.targetMajors, major]
    this.setForm({ targetMajors: list, targetMajorsSet: set })
  },

  setForm(patch) {
    const newForm = { ...this.data.form, ...patch }
    newForm.completeness = this.calcCompleteness(newForm)
    this.setData({ form: newForm, completenessHint: this.makeHint(newForm.completeness) })
  },

  calcCompleteness(f) {
    let s = 0
    if (f.schoolName) s += 10
    if (f.major) s += 10
    if (f.gpa) s += 15
    if (f.gradeRankPercent) s += 10
    if (f.englishType && f.englishScore) s += 15
    const tm = this.parseTargetMajors(f)
    if (tm.length > 0) s += 15
    if (f.researchExperience) s += 10
    if (f.competitionAwards) s += 10
    if (f.customMajors) s += 5
    return Math.min(100, s)
  },

  parseTargetMajors(f) {
    const chips = f.targetMajors || []
    const customs = (f.customMajors || '')
      .split(/[、,，;；\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
    const all = [...chips, ...customs]
    return Array.from(new Set(all))
  },

  async onSave() {
    const { form } = this.data
    if (!form.schoolName || !form.major || !form.gpa) {
      wx.showToast({ title: '请补全基本信息', icon: 'none' })
      return
    }
    const targetMajors = this.parseTargetMajors(form)
    if (targetMajors.length === 0) {
      wx.showToast({ title: '请至少选 1 个目标专业', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const payload = {
        schoolName: form.schoolName,
        major: form.major,
        gpa: form.gpa,
        gradeRankPercent: form.gradeRankPercent ? Number(form.gradeRankPercent) : undefined,
        englishType: form.englishType || undefined,
        englishScore: form.englishScore ? Number(form.englishScore) : undefined,
        researchExperience: form.researchExperience || undefined,
        competitionAwards: form.competitionAwards || undefined,
        targetMajors
      }
      await profileV2Service.update(payload)
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      wx.showToast({
        title: err?.message || '保存失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
