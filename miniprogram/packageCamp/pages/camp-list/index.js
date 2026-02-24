// 夏令营列表页面逻辑
Page({
  data: {
    // 夏令营列表
    campList: [],
    // 筛选选项
    filterOptions: [
      { label: '全部', value: 'all' },
      { label: '报名中', value: 'published' },
      { label: '已截止', value: 'expired' }
    ],
    // 当前激活的筛选
    activeFilter: 'all',
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
      hasMore: true
    })
    this.loadCamps(true)
  },

  refreshData() {
    // 刷新数据
    wx.showLoading({ title: '加载中...' })
    this.loadCamps(true).finally(() => {
      wx.hideLoading()
      wx.stopPullDownRefresh()
    })
  },

  loadCamps(isRefresh = false) {
    // 加载夏令营列表
    // 这里使用模拟数据，实际应该从API获取
    return new Promise((resolve) => {
      const page = isRefresh ? 1 : this.data.page
      
      if (isRefresh) {
        this.setData({ loading: true })
      } else {
        this.setData({ loadingMore: true })
      }

      setTimeout(() => {
        const mockCamps = [
          {
            id: '1',
            universityId: '1',
            universityName: '清华大学',
            universityLogo: 'https://example.com/logo/tsinghua.png',
            title: '计算机学院2024年优秀大学生夏令营',
            deadline: '2024-03-18',
            startDate: '2024-05-10',
            endDate: '2024-05-15',
            location: '北京市',
            status: 'published',
            hasReminder: true
          },
          {
            id: '2',
            universityId: '2',
            universityName: '北京大学',
            universityLogo: 'https://example.com/logo/pku.png',
            title: '软件与微电子学院2024年保研夏令营',
            deadline: '2024-03-22',
            startDate: '2024-05-15',
            endDate: '2024-05-20',
            location: '北京市',
            status: 'published',
            hasReminder: false
          },
          {
            id: '3',
            universityId: '3',
            universityName: '复旦大学',
            universityLogo: 'https://example.com/logo/fudan.png',
            title: 'AI研究院2024年夏令营',
            deadline: '2024-03-30',
            startDate: '2024-05-20',
            endDate: '2024-05-25',
            location: '上海市',
            status: 'published',
            hasReminder: false
          },
          {
            id: '4',
            universityId: '4',
            universityName: '上海交通大学',
            universityLogo: 'https://example.com/logo/sjtu.png',
            title: '电子信息与电气工程学院2024年夏令营',
            deadline: '2024-04-05',
            startDate: '2024-05-25',
            endDate: '2024-05-30',
            location: '上海市',
            status: 'published',
            hasReminder: true
          },
          {
            id: '5',
            universityId: '5',
            universityName: '浙江大学',
            universityLogo: 'https://example.com/logo/zju.png',
            title: '计算机科学与技术学院2024年夏令营',
            deadline: '2024-04-10',
            startDate: '2024-06-01',
            endDate: '2024-06-05',
            location: '杭州市',
            status: 'published',
            hasReminder: false
          }
        ]

        let newCampList = isRefresh ? mockCamps : [...this.data.campList, ...mockCamps]
        
        this.setData({
          campList: newCampList,
          page: page + 1,
          hasMore: newCampList.length < 20, // 模拟只有20条数据
          loading: false,
          loadingMore: false
        })
        resolve()
      }, 800)
    })
  },

  loadMoreCamps() {
    // 加载更多夏令营
    this.loadCamps(false)
  },

  handleFilterChange(e) {
    // 处理筛选变化
    const value = e.currentTarget.dataset.value
    this.setData({
      activeFilter: value,
      page: 1,
      campList: [],
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

  handleRemindTap(e) {
    // 处理设置提醒
    const campId = e.detail.campId
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?campId=${campId}`
    })
  }
})