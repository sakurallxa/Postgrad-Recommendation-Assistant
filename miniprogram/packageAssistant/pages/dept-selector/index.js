import { subscriptionService } from '../../../services/subscription'

Page({
  data: {
    schools: [],
    recommendations: [],
    selectedIds: [],
    selectedCount: 0,
    saving: false
  },

  async onLoad() {
    await this.load()
  },

  async load() {
    try {
      const [schoolsResp, recResp] = await Promise.all([
        subscriptionService.listSchools(),
        subscriptionService.getRecommendations().catch(() => ({ recommendations: [] }))
      ])
      const selectedIds = []
      const schools = (schoolsResp?.schools || []).map((school) => {
        const departments = (school.departments || []).map((d) => {
          if (d.subscribed) selectedIds.push(d.id)
          return {
            ...d,
            majorsText: (d.majors || []).slice(0, 4).join(' · ')
          }
        })
        return {
          ...school,
          departments,
          // 默认：仅有详细院系或已订阅的学校自动展开，其他收起
          expanded: school.hasDetailedDepts && departments.some(d => d.subscribed),
          subscribedCount: departments.filter(d => d.subscribed).length
        }
      })
      this.setData({
        schools,
        recommendations: recResp?.recommendations || [],
        selectedIds,
        selectedCount: selectedIds.length
      })
    } catch (err) {
      wx.showToast({
        title: err?.message || '加载失败',
        icon: 'none'
      })
    }
  },

  onToggleSchool(e) {
    const slug = e.currentTarget.dataset.slug
    const schools = this.data.schools.map(s =>
      s.schoolSlug === slug ? { ...s, expanded: !s.expanded } : s
    )
    this.setData({ schools })
  },

  onToggleDept(e) {
    const id = e.currentTarget.dataset.id
    const schools = this.data.schools.map((school) => {
      const departments = school.departments.map((d) => (
        d.id === id ? { ...d, subscribed: !d.subscribed } : d
      ))
      return {
        ...school,
        departments,
        subscribedCount: departments.filter(d => d.subscribed).length
      }
    })
    const selectedIds = []
    schools.forEach(s => s.departments.forEach(d => d.subscribed && selectedIds.push(d.id)))
    this.setData({ schools, selectedIds, selectedCount: selectedIds.length })
  },

  onTapRecommend(e) {
    const id = e.currentTarget.dataset.id
    const schools = this.data.schools.map((school) => {
      const departments = school.departments.map((d) => (
        d.id === id ? { ...d, subscribed: true } : d
      ))
      return {
        ...school,
        departments,
        subscribedCount: departments.filter(d => d.subscribed).length,
        expanded: school.expanded || departments.some(d => d.id === id)
      }
    })
    const selectedIds = []
    schools.forEach(s => s.departments.forEach(d => d.subscribed && selectedIds.push(d.id)))
    this.setData({ schools, selectedIds, selectedCount: selectedIds.length })
  },

  onAcceptAllRecommendations() {
    const recIds = new Set(this.data.recommendations.map(r => r.departmentId))
    const schools = this.data.schools.map((school) => {
      const departments = school.departments.map((d) => (
        recIds.has(d.id) ? { ...d, subscribed: true } : d
      ))
      return {
        ...school,
        departments,
        subscribedCount: departments.filter(d => d.subscribed).length,
        expanded: school.expanded || departments.some(d => recIds.has(d.id))
      }
    })
    const selectedIds = []
    schools.forEach(s => s.departments.forEach(d => d.subscribed && selectedIds.push(d.id)))
    this.setData({ schools, selectedIds, selectedCount: selectedIds.length })
  },

  async onSave() {
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请至少选 1 个院系', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const result = await subscriptionService.batchSubscribe(this.data.selectedIds)
      const total = result?.totalActive || this.data.selectedIds.length
      wx.showToast({
        title: `已订阅 ${total} 个院系`,
        icon: 'success'
      })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      wx.showToast({
        title: err?.message || '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
