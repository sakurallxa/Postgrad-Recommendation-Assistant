import { campService } from '../../../services/camp'
import { normalizeAnnouncementType } from '../../../services/announcement'
import { userStore } from '../../../store/user'

Page({
  data: {
    rawCampList: [],
    campList: [],
    filterOptions: [
      { label: '全部', value: 'all' },
      { label: '报名中', value: 'published' },
      { label: '已截止', value: 'expired' }
    ],
    activeFilter: 'all',
    mode: 'all',
    searchKeyword: '',
    searchFocused: false,
    searchResultHint: '',
    loading: false,
    loadingMore: false,
    hasMore: false,
    page: 1,
    pageSize: 20
  },

  onLoad(options = {}) {
    const mode = this.resolveMode(options.mode)
    this.setData({ mode })
    this.updateNavigationTitle(mode)
    if (mode === 'followed' && !this.hasAuthToken()) {
      this.redirectToLogin()
      return
    }
    this.initPage()
  },

  onReachBottom() {
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadMoreCamps()
    }
  },

  onPullDownRefresh() {
    this.refreshData()
  },

  resolveMode(mode = '') {
    if (mode === 'urgent') return 'urgent'
    if (mode === 'opportunity') return 'opportunity'
    if (mode === 'followed') return 'followed'
    return 'all'
  },

  updateNavigationTitle(mode) {
    const titleMap = {
      urgent: '即将截止公告',
      opportunity: '保研机会池',
      followed: '已关注公告',
      all: '夏令营/预推免列表'
    }
    wx.setNavigationBarTitle({
      title: titleMap[mode] || titleMap.all
    })
  },

  hasAuthToken() {
    return Boolean(userStore.token || wx.getStorageSync('token'))
  },

  redirectToLogin() {
    wx.showModal({
      title: '需要先登录',
      content: '登录后才能查看账号已关注院校的公告。',
      confirmText: '去登录',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/my/my' })
          return
        }
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/index/index' })
        })
      }
    })
  },

  initPage() {
    this.setData({
      page: 1,
      rawCampList: [],
      campList: [],
      hasMore: false
    })
    this.loadCamps(true)
  },

  refreshData() {
    wx.showLoading({ title: '加载中...' })
    this.loadCamps(true).finally(() => {
      wx.hideLoading()
      wx.stopPullDownRefresh()
    })
  },

  async loadCamps(isRefresh = false) {
    if (isRefresh) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const sourceList = await this.fetchCampSourceList()
      const normalizedList = this.sanitizeCampList(
        sourceList.map(item => this.normalizeCampItem(item))
      )
      const filteredList = this.applyPageFilters(normalizedList)

      this.setData({
        rawCampList: normalizedList,
        campList: filteredList,
        searchResultHint: this.getSearchResultHint(filteredList),
        page: 2,
        hasMore: false
      })
    } catch (error) {
      const normalizedList = this.sanitizeCampList(
        this.getMockCamps().map(item => this.normalizeCampItem(item))
      )
      this.setData({
        rawCampList: normalizedList,
        campList: this.applyPageFilters(normalizedList),
        searchResultHint: this.getSearchResultHint(this.applyPageFilters(normalizedList)),
        page: 2,
        hasMore: false
      })
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      })
    }
  },

  async fetchCampSourceList() {
    if (!this.shouldUseRemoteCampApi()) {
      return this.getMockCamps()
    }

    const queryParams = {
      page: 1,
      limit: 200
    }
    if (this.data.mode === 'all') {
      if (this.data.activeFilter !== 'all') {
        queryParams.status = this.data.activeFilter
      }
    } else if (this.data.mode === 'followed') {
      const followedIds = this.getFollowedUniversities().map(item => item.id)
      if (followedIds.length > 0) {
        queryParams.universityIds = followedIds
      }
      queryParams.status = 'published'
    } else {
      queryParams.status = 'published'
    }

    const response = await campService.getCamps(queryParams, {
      showLoading: false,
      showError: false
    })
    return Array.isArray(response?.data) ? response.data : []
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteCampApi')
    if (forceRemote === true) {
      return true
    }
    return Boolean(baseUrl)
  },

  normalizeCampItem(item) {
    if (!item || typeof item !== 'object') {
      return null
    }

    const normalized = normalizeAnnouncementType({
      ...item,
      universityName: item.universityName || item.university?.name || '',
      universityLogo: item.universityLogo || item.university?.logo || '',
      universityId: item.universityId || item.university?.id || '',
      universityWebsite: item.universityWebsite || item.university?.website || ''
    })
    return {
      ...normalized,
      title: this.sanitizeCampTitle(normalized.title),
      publishDate: this.formatDateOnly(normalized.publishDate),
      deadline: this.formatDateOnly(normalized.deadline),
      startDate: this.formatDateOnly(normalized.startDate),
      endDate: this.formatDateOnly(normalized.endDate)
    }
  },

  sanitizeCampList(list) {
    if (!Array.isArray(list)) return []
    return list.filter(item => item && typeof item === 'object')
  },

  applyPageFilters(sourceList) {
    const mode = this.data.mode
    const activeFilter = this.data.activeFilter
    const searchKeyword = this.normalizeSearchKeyword(this.data.searchKeyword)

    let list = sourceList.slice()
    if (mode === 'all' && activeFilter !== 'all') {
      list = list.filter(item => item.status === activeFilter)
    }

    if (mode === 'urgent') {
      list = list
        .filter(item => item.status === 'published')
        .filter(item => item.deadline)
        .filter(item => this.getDaysRemaining(item.deadline) >= 0)
        .sort((a, b) => this.getDeadlineTimestamp(a.deadline) - this.getDeadlineTimestamp(b.deadline))
    }

    if (mode === 'opportunity') {
      list = list
        .filter(item => item.status === 'published')
        .sort((a, b) => this.getDeadlineTimestamp(a.deadline) - this.getDeadlineTimestamp(b.deadline))
    }

    if (mode === 'followed') {
      const followedIds = this.getFollowedUniversities().map(item => item.id)
      list = list
        .filter(item => item.status === 'published')
        .filter(item => followedIds.includes(item.universityId))
        .sort((a, b) => this.getDeadlineTimestamp(a.deadline) - this.getDeadlineTimestamp(b.deadline))
    }

    if (mode === 'opportunity' && searchKeyword) {
      list = list.filter(item => this.matchCampByKeyword(item, searchKeyword))
    }

    return list
  },

  normalizeSearchKeyword(keyword) {
    return String(keyword || '').trim().toLowerCase().replace(/\s+/g, '')
  },

  matchCampByKeyword(item, keyword) {
    if (!item || !keyword) return true
    const typeHints = item.announcementType === 'pre_recommendation'
      ? '预推免 预推免公告 推免 推荐免试'
      : '夏令营 夏令营公告 暑期营'
    const searchSource = [
      item.title || '',
      item.universityName || '',
      item.location || '',
      item.announcementTypeLabel || '',
      typeHints
    ].join(' ')
    const normalizedSource = this.normalizeSearchKeyword(searchSource)
    return normalizedSource.indexOf(keyword) > -1
  },

  getFollowedUniversities() {
    if (!this.hasAuthToken()) {
      return []
    }
    const localUniversities = wx.getStorageSync('selectedUniversities') || []
    const userSelection = wx.getStorageSync('userSelection') || {}
    const selectionUniversities = userSelection.universities || []
    const merged = {}
    const allUniversities = localUniversities.concat(selectionUniversities)
    allUniversities.forEach((item) => {
      if (!item || !item.id) return
      merged[item.id] = item
    })
    return Object.values(merged)
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

  formatDateOnly(value) {
    const text = String(value || '').trim()
    if (!text) return ''
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
      const day = `${parsed.getDate()}`.padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const match = text.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/)
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    }
    return text.replace(/T.*$/, '').replace(/\s+\d{2}:\d{2}.*$/, '')
  },

  applyCurrentFiltersFromRaw() {
    const filteredList = this.applyPageFilters(this.data.rawCampList || [])
    this.setData({
      campList: filteredList,
      searchResultHint: this.getSearchResultHint(filteredList)
    })
  },

  getSearchResultHint(filteredList = []) {
    const keyword = this.normalizeSearchKeyword(this.data.searchKeyword)
    if (!keyword || this.data.mode !== 'opportunity') {
      return ''
    }
    return `已匹配 ${filteredList.length} 条公告`
  },

  getDeadlineTimestamp(deadline) {
    if (!deadline) return new Date('2999-12-31').getTime()
    const parsed = new Date(deadline)
    if (Number.isNaN(parsed.getTime())) return new Date('2999-12-31').getTime()
    return parsed.getTime()
  },

  getDaysRemaining(deadline) {
    const timestamp = this.getDeadlineTimestamp(deadline)
    if (!Number.isFinite(timestamp)) return -1
    return Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000))
  },

  getMockCamps() {
    return [
      {
        id: '1',
        universityId: '1',
        universityName: '清华大学',
        universityLogo: '',
        title: '计算机学院2026年优秀大学生夏令营',
        announcementType: 'summer_camp',
        deadline: '2026-03-18',
        startDate: '2026-05-10',
        endDate: '2026-05-15',
        location: '北京市',
        status: 'published',
        hasReminder: true
      },
      {
        id: '2',
        universityId: '2',
        universityName: '北京大学',
        universityLogo: '',
        title: '软件与微电子学院2026年保研夏令营',
        announcementType: 'summer_camp',
        deadline: '2026-03-22',
        startDate: '2026-05-15',
        endDate: '2026-05-20',
        location: '北京市',
        status: 'published',
        hasReminder: false
      },
      {
        id: '3',
        universityId: '3',
        universityName: '复旦大学',
        universityLogo: '',
        title: 'AI研究院2024年预推免通知',
        announcementType: 'pre_recommendation',
        deadline: '2026-03-12',
        startDate: '',
        endDate: '',
        location: '上海市',
        status: 'published',
        hasReminder: false
      },
      {
        id: '4',
        universityId: '4',
        universityName: '上海交通大学',
        universityLogo: '',
        title: '电子信息与电气工程学院2026年夏令营',
        announcementType: 'summer_camp',
        deadline: '2026-04-05',
        startDate: '2026-05-25',
        endDate: '2026-05-30',
        location: '上海市',
        status: 'published',
        hasReminder: true
      },
      {
        id: '5',
        universityId: '5',
        universityName: '浙江大学',
        universityLogo: '',
        title: '计算机科学与技术学院2025年预推免工作通知',
        announcementType: 'pre_recommendation',
        deadline: '2026-04-10',
        startDate: '',
        endDate: '',
        location: '杭州市',
        status: 'published',
        hasReminder: true
      }
    ]
  },

  loadMoreCamps() {
    this.setData({ hasMore: false })
  },

  handleFilterChange(e) {
    if (this.data.mode !== 'all') {
      return
    }

    const value = e.currentTarget.dataset.value
    this.setData({
      activeFilter: value,
      page: 1,
      campList: [],
      hasMore: false
    })
    this.loadCamps(true)
  },

  handleSearchInput(e) {
    if (this.data.mode !== 'opportunity') {
      return
    }
    const value = e.detail?.value || ''
    this.setData({
      searchKeyword: value
    }, () => {
      this.applyCurrentFiltersFromRaw()
    })
  },

  handleSearchBarTap() {
    if (this.data.mode !== 'opportunity') {
      return
    }
    if (!this.data.searchFocused) {
      this.setData({ searchFocused: true })
    }
  },

  handleSearchFocus() {
    if (!this.data.searchFocused) {
      this.setData({ searchFocused: true })
    }
  },

  handleSearchBlur() {
    if (this.data.searchFocused) {
      this.setData({ searchFocused: false })
    }
  },

  handleCampTap(e) {
    const detail = e.detail || {}
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {}
    this.navigateToCampDetail({
      campId: detail.campId || dataset.id || dataset.campId || '',
      announcementType: detail.announcementType || dataset.announcementType || '',
      title: detail.title || dataset.title || ''
    })
  },

  navigateToCampDetail({ campId = '', announcementType = '', title = '' } = {}) {
    if (!campId) {
      wx.showToast({
        title: '公告信息缺失',
        icon: 'none'
      })
      return
    }

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

  handleRemindTap(e) {
    const { campId, title = '', deadline = '', universityName = '' } = e.detail || {}
    const query = [
      `campId=${encodeURIComponent(campId || '')}`,
      `title=${encodeURIComponent(title)}`,
      `deadline=${encodeURIComponent(deadline)}`,
      `universityName=${encodeURIComponent(universityName)}`
    ].join('&')
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?${query}`
    })
  }
})
