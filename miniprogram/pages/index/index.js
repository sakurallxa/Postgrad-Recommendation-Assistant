// 首页逻辑
import { selectionStore } from '../../store/selection'
import { campService } from '../../services/camp'
import { http } from '../../services/http'

Page({
  data: {
    // 统计数据
    stats: {
      universityCount: 0,
      campCount: 0,
      reminderCount: 0
    },
    // 即将截止的夏令营
    urgentCamps: [],
    // 夏令营列表
    campList: [],
    allCampList: [],
    // 状态筛选选项
    statusFilterOptions: [
      { label: '全部', value: 'all' },
      { label: '报名中', value: 'published' },
      { label: '已截止', value: 'expired' }
    ],
    yearFilterOptions: [{ label: '全部年份', value: 'all' }],
    universityFilterOptions: [{ label: '全部', value: 'all' }],
    showFollowGuide: false,
    // 当前激活的筛选
    activeStatusFilter: 'all',
    activeYearFilter: 'all',
    activeUniversityFilter: 'all',
    // 加载状态
    loading: false,
    loadingMore: false,
    hasMore: true,
    // 分页信息
    page: 1,
    pageSize: 20
  },

  onLoad() {
    // 初始化页面
    this.initPage()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadUserSelection()
    this.refreshData()
  },

  onReachBottom() {
    // 触底加载更多
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadMoreCamps()
    }
  },

  onPullDownRefresh() {
    // 下拉刷新
    this.refreshData()
  },

  initPage() {
    // 初始化页面数据
    this.setData({
      page: 1,
      campList: [],
      allCampList: [],
      hasMore: true
    })
    this.initYearFilters()
    this.updateUniversityFilterOptions()
  },

  refreshData() {
    // 刷新所有数据
    wx.showLoading({ title: '加载中...' })
    
    Promise.all([
      this.loadStats(),
      this.loadUrgentCamps(),
      this.loadCamps(true)
    ]).finally(() => {
      wx.hideLoading()
      wx.stopPullDownRefresh()
    })
  },

  loadStats() {
    const followed = this.getFollowedUniversities()
    this.setData({
      stats: {
        ...this.data.stats,
        universityCount: followed.length
      }
    })
    return Promise.resolve()
  },

  async loadUserSelection() {
    try {
      if (!this.shouldUseRemoteUserApi()) {
        return
      }
      const selection = await http.get('/user/selection', null, {
        showLoading: false,
        showError: false
      })
      const universities = selection?.universities || []
      wx.setStorageSync('selectedUniversities', universities)
      selectionStore.setSelection(universities, selection?.majors || [])
    } catch (error) {
      // 如果接口不可用，保持本地已有数据
    } finally {
      this.updateUniversityFilterOptions()
    }
  },

  loadUrgentCamps() {
    this.setData({ urgentCamps: [] })
    if (!this.shouldUseRemoteCampApi()) {
      const urgent = this.buildUrgentCamps(this.getMockCamps())
      this.setData({ urgentCamps: urgent })
      return Promise.resolve()
    }

    return campService.getCamps(
      { page: 1, limit: 50, status: 'published' },
      { showLoading: false, showError: false }
    ).then(response => {
      const fetchedList = Array.isArray(response?.data) ? response.data : []
      const normalizedList = fetchedList.map(item => this.normalizeCampItem(item))
      const urgent = this.buildUrgentCamps(normalizedList)
      this.setData({ urgentCamps: urgent })
    }).catch(() => {
      const urgent = this.buildUrgentCamps(this.getMockCamps())
      this.setData({ urgentCamps: urgent })
    })
  },

  async loadCamps(isRefresh = false) {
    const page = isRefresh ? 1 : this.data.page
    if (isRefresh) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      if (this.shouldUseRemoteCampApi()) {
        const queryParams = this.buildCampQueryParams(page)
        const response = await campService.getCamps(queryParams, {
          showLoading: false,
          showError: false
        })
        const fetchedList = Array.isArray(response?.data) ? response.data : []
        const normalizedList = fetchedList.map(item => this.normalizeCampItem(item))
        const mergedList = isRefresh ? normalizedList : this.data.allCampList.concat(normalizedList)
        const filteredList = this.applyCampFilters(mergedList)
        const meta = response?.meta || {}

        this.setData({
          allCampList: mergedList,
          campList: filteredList,
          page: page + 1,
          hasMore: Boolean(meta.totalPages ? page < meta.totalPages : normalizedList.length >= this.data.pageSize),
          stats: {
            ...this.data.stats,
            campCount: filteredList.length
          }
        })
        this.updateUniversityFilterOptions()
      } else {
        const mockList = this.getMockCamps()
        const filteredList = this.applyCampFilters(mockList)
        this.setData({
          allCampList: mockList,
          campList: filteredList,
          hasMore: false,
          stats: {
            ...this.data.stats,
            campCount: filteredList.length
          }
        })
        this.updateUniversityFilterOptions()
      }
    } catch (error) {
      // API不可用时回退到本地模拟数据，保证筛选功能可调试
      const mockList = this.getMockCamps()
      const filteredList = this.applyCampFilters(mockList)
      this.setData({
        allCampList: mockList,
        campList: filteredList,
        hasMore: false,
        stats: {
          ...this.data.stats,
          campCount: filteredList.length
        }
      })
      this.updateUniversityFilterOptions()
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      })
    }

  },

  loadMoreCamps() {
    // 加载更多夏令营
    this.loadCamps(false)
  },

  handleFilterChange(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      activeStatusFilter: value,
      page: 1,
      campList: [],
      allCampList: [],
      hasMore: true
    })
    this.loadCamps(true)
  },

  handleYearFilterChange(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      activeYearFilter: value,
      page: 1,
      campList: [],
      allCampList: [],
      hasMore: true
    })
    this.loadCamps(true)
  },

  handleUniversityFilterChange(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      activeUniversityFilter: value,
      page: 1,
      campList: [],
      allCampList: [],
      hasMore: true
    })
    this.loadCamps(true)
  },

  handleCampTap(e) {
    // 处理夏令营点击
    const campId = e.detail.campId
    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?id=${campId}`
    })
  },

  handleUrgentCampTap(e) {
    // 处理即将截止卡片点击
    const campId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?id=${campId}`
    })
  },

  handleRemindTap(e) {
    // 处理设置提醒
    const campId = e.detail.campId
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?campId=${campId}`
    })
  },

  initYearFilters() {
    const currentYear = new Date().getFullYear()
    const yearFilterOptions = [
      { label: '全部年份', value: 'all' },
      { label: String(currentYear), value: String(currentYear) },
      { label: String(currentYear - 1), value: String(currentYear - 1) },
      { label: String(currentYear - 2), value: String(currentYear - 2) }
    ]
    this.setData({ yearFilterOptions })
  },

  updateUniversityFilterOptions() {
    const followed = this.getFollowedUniversities()
    const options = [{ label: '全部院校', value: 'all' }]

    if (followed.length > 0) {
      followed.forEach(uni => {
        options.push({ label: uni.name, value: uni.id })
      })
    }

    this.setData({
      universityFilterOptions: options,
      activeUniversityFilter: this.data.activeUniversityFilter || 'all',
      showFollowGuide: followed.length === 0
    })
  },

  handleOpenSelector() {
    wx.navigateTo({
      url: '/packageSelector/pages/selector/index'
    })
  },

  mergeUniversities(storeUniversities, localUniversities) {
    const merged = {}
    const all = [].concat(storeUniversities || [], localUniversities || [])
    all.forEach(item => {
      if (!item) return
      const id = item.id || item.universityId
      const name = item.name || item.universityName
      if (!id || !name) return
      merged[id] = { ...item, id, name }
    })
    return Object.keys(merged).map(id => merged[id])
  },

  getFollowedUniversities() {
    const storeUniversities = selectionStore.selectedUniversities || []
    const localUniversities = wx.getStorageSync('selectedUniversities') || []
    const userSelection = wx.getStorageSync('userSelection') || {}
    const selectionUniversities = userSelection.universities || []
    return this.mergeUniversities(storeUniversities, localUniversities.concat(selectionUniversities))
  },

  getCampUniversities() {
    return []
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteCampApi')
    if (forceRemote === true) {
      return true
    }
    // 当前云开发域名未部署 camps API，默认走本地数据避免持续404
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  shouldUseRemoteUserApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  buildCampQueryParams(page) {
    const {
      pageSize,
      activeStatusFilter,
      activeYearFilter,
      activeUniversityFilter
    } = this.data
    const followedIds = this.getFollowedUniversities().map(item => item.id)

    const params = { page, limit: pageSize }
    if (activeStatusFilter !== 'all') params.status = activeStatusFilter
    if (activeYearFilter !== 'all') params.year = activeYearFilter
    if (activeUniversityFilter === 'all') {
      if (followedIds.length > 0) {
        params.universityIds = followedIds
      }
    } else {
      params.universityId = activeUniversityFilter
    }

    return params
  },

  applyCampFilters(sourceList) {
    const {
      activeStatusFilter,
      activeYearFilter,
      activeUniversityFilter
    } = this.data
    const followedIds = this.getFollowedUniversities().map(item => item.id)

    return sourceList.filter(camp => {
      if (activeStatusFilter !== 'all' && camp.status !== activeStatusFilter) {
        return false
      }

      if (activeYearFilter !== 'all' && String(this.getCampYear(camp)) !== String(activeYearFilter)) {
        return false
      }

    if (activeUniversityFilter === 'all') {
      if (followedIds.length > 0 && followedIds.indexOf(camp.universityId) === -1) {
        return false
      }
    } else if (camp.universityId !== activeUniversityFilter) {
      return false
    }

      return true
    })
  },

  getCampYear(camp) {
    const dateFields = [camp.publishDate, camp.deadline, camp.startDate, camp.endDate]
    for (let i = 0; i < dateFields.length; i += 1) {
      const value = dateFields[i]
      if (!value) continue
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return date.getFullYear()
      }
    }

    const matched = String(camp.title || '').match(/(20\d{2})/)
    if (matched) {
      return Number(matched[1])
    }

    return new Date().getFullYear()
  },

  normalizeCampItem(item) {
    return {
      ...item,
      universityName: item.universityName || item.university?.name || '',
      universityLogo: item.universityLogo || item.university?.logo || '',
      universityId: item.universityId || item.university?.id || '',
    }
  },

  buildUrgentCamps(sourceList) {
    return sourceList
      .filter(item => item.status === 'published')
      .filter(item => item.deadline)
      .map(item => {
        const deadlineDate = new Date(item.deadline)
        const daysRemaining = Math.ceil((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        return {
          id: item.id,
          universityName: item.universityName,
          title: item.title,
          deadline: item.deadline,
          daysRemaining,
          deadlineText: `${item.deadline} 截止`,
          statusClass: daysRemaining <= 3 ? 'urgent' : (daysRemaining <= 7 ? 'warning' : 'normal')
        }
      })
      .filter(item => item.daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 5)
  },

  getMockCamps() {
    return [
      {
        id: '1',
        universityId: '1',
        universityName: '清华大学',
        universityLogo: '',
        title: '计算机学院2026年优秀大学生夏令营',
        publishDate: '2026-03-01',
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
        title: '软件与微电子学院2025年保研夏令营',
        publishDate: '2025-03-01',
        deadline: '2025-03-22',
        startDate: '2025-05-15',
        endDate: '2025-05-20',
        location: '北京市',
        status: 'expired',
        hasReminder: false
      },
      {
        id: '3',
        universityId: '3',
        universityName: '复旦大学',
        universityLogo: '',
        title: 'AI研究院2024年夏令营',
        publishDate: '2024-03-01',
        deadline: '2024-03-30',
        startDate: '2024-05-20',
        endDate: '2024-05-25',
        location: '上海市',
        status: 'expired',
        hasReminder: false
      },
      {
        id: '4',
        universityId: '4',
        universityName: '上海交通大学',
        universityLogo: '',
        title: '电子信息与电气工程学院2026年夏令营',
        publishDate: '2026-02-20',
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
        title: '计算机科学与技术学院2025年夏令营',
        publishDate: '2025-02-15',
        deadline: '2025-04-10',
        startDate: '2025-06-01',
        endDate: '2025-06-05',
        location: '杭州市',
        status: 'expired',
        hasReminder: false
      }
    ]
  }
})
