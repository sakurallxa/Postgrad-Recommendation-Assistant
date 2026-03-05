import { campService } from '../../../services/camp'
import { normalizeAnnouncementType } from '../../../services/announcement'

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
    return 'all'
  },

  updateNavigationTitle(mode) {
    const titleMap = {
      urgent: '即将截止公告',
      opportunity: '保研机会池',
      all: '夏令营/预推免列表'
    }
    wx.setNavigationBarTitle({
      title: titleMap[mode] || titleMap.all
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
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  normalizeCampItem(item) {
    if (!item || typeof item !== 'object') {
      return null
    }

    return normalizeAnnouncementType({
      ...item,
      universityName: item.universityName || item.university?.name || '',
      universityLogo: item.universityLogo || item.university?.logo || '',
      universityId: item.universityId || item.university?.id || ''
    })
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
