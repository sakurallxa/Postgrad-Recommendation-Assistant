import { observable, action, computed, makeObservable, runInAction } from 'mobx-miniprogram'

class CampStore {
  constructor() {
    makeObservable(this)
  }

  @observable
  campList = []

  @observable
  currentCamp = null

  @observable
  loading = false

  @observable
  loadingMore = false

  @observable
  hasMore = true

  @observable
  page = 1

  @observable
  pageSize = 20

  @observable
  filters = {
    universityIds: [],
    majorIds: [],
    status: 'published'
  }

  @computed
  get filteredCampList() {
    return this.campList.filter(camp => {
      if (this.filters.status && camp.status !== this.filters.status) {
        return false
      }
      return true
    })
  }

  @computed
  get urgentCamps() {
    const now = new Date()
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    return this.campList.filter(camp => {
      if (!camp.deadline) return false
      const deadline = new Date(camp.deadline)
      return deadline <= threeDaysLater && deadline >= now
    })
  }

  @action
  setFilters(filters) {
    this.filters = { ...this.filters, ...filters }
    this.page = 1
    this.hasMore = true
  }

  @action
  async fetchCampList(isRefresh = false) {
    if (this.loading || this.loadingMore) return

    if (isRefresh) {
      this.page = 1
      this.hasMore = true
    }

    if (!isRefresh && !this.hasMore) return

    try {
      if (this.page === 1) {
        this.loading = true
      } else {
        this.loadingMore = true
      }

      // 模拟API请求
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 模拟数据
      const mockList = [
        {
          id: '1',
          universityId: '1',
          universityName: '清华大学',
          universityLogo: '',
          majorId: '1',
          majorName: '计算机科学与技术',
          title: '计算机科学与技术系2024年优秀大学生夏令营',
          sourceUrl: 'https://example.com',
          publishDate: '2024-03-01',
          deadline: '2024-03-18',
          startDate: '2024-07-01',
          endDate: '2024-07-10',
          location: '北京市海淀区',
          requirements: {
            education: '本科在读',
            gpa: '前30%',
            english: 'CET-6 450分以上',
            major: '计算机相关专业'
          },
          materials: ['个人简历', '成绩单', '英语成绩证明', '获奖证书', '推荐信'],
          process: [
            { step: 1, action: '网上报名', deadline: '2024-05-30' },
            { step: 2, action: '提交材料', deadline: '2024-06-05' },
            { step: 3, action: '等待审核', note: '预计7个工作日' }
          ],
          status: 'published',
          hasReminder: true
        },
        {
          id: '2',
          universityId: '2',
          universityName: '北京大学',
          universityLogo: '',
          majorId: '2',
          majorName: '软件与微电子',
          title: '软件与微电子学院2024年保研夏令营',
          sourceUrl: 'https://example.com',
          publishDate: '2024-03-05',
          deadline: '2024-03-22',
          startDate: '2024-07-05',
          endDate: '2024-07-15',
          location: '北京市海淀区',
          requirements: {
            education: '本科在读',
            gpa: '前20%',
            english: 'CET-6 500分以上',
            major: '计算机、软件相关专业'
          },
          materials: ['个人简历', '成绩单', '英语成绩证明', '获奖证书', '推荐信'],
          process: [
            { step: 1, action: '网上报名', deadline: '2024-06-01' },
            { step: 2, action: '提交材料', deadline: '2024-06-10' },
            { step: 3, action: '等待审核', note: '预计10个工作日' }
          ],
          status: 'published',
          hasReminder: false
        }
      ]

      runInAction(() => {
        if (isRefresh || this.page === 1) {
          this.campList = mockList
        } else {
          this.campList = [...this.campList, ...mockList]
        }
        this.hasMore = this.campList.length < 100
        this.page++
      })
    } catch (error) {
      console.error('获取夏令营列表失败:', error)
      throw error
    } finally {
      runInAction(() => {
        this.loading = false
        this.loadingMore = false
      })
    }
  }

  @action
  async fetchCampDetail(campId) {
    this.loading = true
    try {
      // 模拟API请求
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 模拟数据
      const mockCamp = {
        id: campId,
        universityId: '1',
        universityName: '清华大学',
        universityLogo: '',
        majorId: '1',
        majorName: '计算机科学与技术',
        title: '计算机科学与技术系2024年优秀大学生夏令营',
        sourceUrl: 'https://example.com',
        publishDate: '2024-03-01',
        deadline: '2024-03-18',
        startDate: '2024-07-01',
        endDate: '2024-07-10',
        location: '北京市海淀区',
        requirements: {
          education: '本科在读',
          gpa: '前30%',
          english: 'CET-6 450分以上',
          major: '计算机相关专业',
          other: ['有科研经历优先']
        },
        materials: ['个人简历', '成绩单', '英语成绩证明', '获奖证书', '推荐信'],
        process: [
          { step: 1, action: '网上报名', deadline: '2024-05-30' },
          { step: 2, action: '提交材料', deadline: '2024-06-05' },
          { step: 3, action: '等待审核', note: '预计7个工作日' },
          { step: 4, action: '夏令营活动', deadline: '2024-07-01' }
        ],
        contact: {
          email: 'baoyan@tsinghua.edu.cn',
          phone: '010-12345678',
          address: '北京市海淀区清华大学计算机科学与技术系'
        },
        status: 'published'
      }

      runInAction(() => {
        this.currentCamp = mockCamp
      })
      return mockCamp
    } catch (error) {
      console.error('获取夏令营详情失败:', error)
      throw error
    } finally {
      runInAction(() => {
        this.loading = false
      })
    }
  }

  @action
  reset() {
    this.campList = []
    this.currentCamp = null
    this.page = 1
    this.hasMore = true
    this.filters = {
      universityIds: [],
      majorIds: [],
      status: 'published'
    }
  }
}

export const campStore = new CampStore()