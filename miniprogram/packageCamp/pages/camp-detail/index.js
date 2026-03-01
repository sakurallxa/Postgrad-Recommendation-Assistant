// 夏令营详情页
import { campService } from '../../../services/camp'
import { progressService } from '../../../services/progress'

Page({
  data: {
    campId: '',
    campDetail: {
      id: '',
      universityId: '',
      universityName: '',
      universityLogo: '',
      title: '',
      sourceUrl: '',
      publishDate: '',
      deadline: '',
      startDate: '',
      endDate: '',
      location: '',
      requirements: {},
      materials: [],
      process: [],
      contact: {},
      status: '',
      hasReminder: false,
      hasProgress: false
    },
    loading: true,
    showCopySuccess: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ campId: options.id });
      this.loadCampDetail();
    }
  },

  async loadCampDetail() {
    // 加载夏令营详情
    this.setData({ loading: true });

    try {
      if (this.shouldUseRemoteCampApi()) {
        const detail = await campService.getCampDetail(this.data.campId, {
          showLoading: false,
          showError: false
        })
        const normalized = this.normalizeCampDetail(detail)
        this.setData({
          campDetail: this.withProgressFlag(normalized),
          loading: false
        })
        return
      }
    } catch (error) {
      // 远端不可用时走本地mock
    }

    const mockDetail = this.getMockDetail()
    this.setData({
      campDetail: this.withProgressFlag(mockDetail),
      loading: false
    })
  },

  withProgressFlag(detail) {
    const list = wx.getStorageSync('progressFallbackList') || []
    const reminderCampIds = wx.getStorageSync('reminderCampIds') || []
    const exists = list.some(item => item.campId === detail.id)
    const hasReminder = reminderCampIds.includes(detail.id)
    return {
      ...detail,
      hasProgress: detail.hasProgress || exists,
      hasReminder: detail.hasReminder || hasReminder
    }
  },

  normalizeCampDetail(detail) {
    const normalized = {
      ...detail,
      universityId: detail.universityId || detail.university?.id || '',
      universityName: detail.universityName || detail.university?.name || '',
      universityLogo: detail.universityLogo || detail.university?.logo || '',
    }
    if (!normalized.universityLogo) {
      normalized.universityLogo = this.getUniversityLogo(normalized.universityId, normalized.universityName)
    }
    normalized.materials = this.enrichMaterials(normalized.materials || [])
    return normalized
  },

  getUniversityLogo(universityId, universityName) {
    const localUniversities = wx.getStorageSync('selectedUniversities') || []
    const userSelection = wx.getStorageSync('userSelection') || {}
    const selectionUniversities = userSelection.universities || []
    const all = [].concat(localUniversities, selectionUniversities)
    const matched = all.find(item =>
      (universityId && item.id === universityId) ||
      (universityName && item.name === universityName)
    )
    return matched?.logo || ''
  },

  getMockDetail() {
    const logo = this.getUniversityLogo('1', '清华大学')
    return {
      id: this.data.campId,
      universityId: '1',
      universityName: '清华大学',
      universityLogo: logo,
      title: '计算机学院2024年优秀大学生夏令营',
      sourceUrl: 'https://example.com/camp/1',
      publishDate: '2024-03-01',
      deadline: '2024-03-18',
      startDate: '2024-05-10',
      endDate: '2024-05-15',
      location: '北京市海淀区清华大学',
      requirements: {
        education: '本科在读',
        gpa: '前30%',
        english: 'CET-6 450分以上',
        major: '计算机相关专业',
        other: ['有科研经历优先', '有竞赛获奖优先']
      },
      materials: this.enrichMaterials([
        '个人简历',
        '成绩单',
        '英语成绩证明',
        '获奖证书',
        '推荐信',
        '个人陈述',
        '研究计划'
      ]),
      process: [
        { step: 1, action: '网上报名', deadline: '2024-03-18' },
        { step: 2, action: '提交材料', deadline: '2024-03-20' },
        { step: 3, action: '等待审核', note: '预计7个工作日' },
        { step: 4, action: '夏令营活动', period: '2024-05-10至2024-05-15' },
        { step: 5, action: '结果通知', note: '活动结束后一周内' }
      ],
      contact: {
        email: 'admission@cs.tsinghua.edu.cn',
        phone: '010-12345678',
        address: '北京市海淀区清华大学计算机科学与技术系'
      },
      status: 'published',
      hasReminder: false,
      hasProgress: false
    }
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  shouldUseRemoteProgressApi() {
    return this.shouldUseRemoteCampApi()
  },

  handleSetReminder() {
    // 设置提醒
    const { campDetail } = this.data;
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?campId=${campDetail.id}&title=${encodeURIComponent(campDetail.title)}&deadline=${campDetail.deadline}&universityName=${encodeURIComponent(campDetail.universityName)}`
    });
  },

  async handleAddToProgress() {
    const campId = this.data.campDetail.id
    if (!campId) return

    wx.showLoading({ title: '处理中...' })

    try {
      if (this.shouldUseRemoteProgressApi()) {
        const progress = await progressService.createProgress({ campId }, {
          showLoading: false,
          showError: false
        })
        this.setData({
          campDetail: {
            ...this.data.campDetail,
            hasProgress: true
          }
        })
        wx.showToast({ title: '已加入进展', icon: 'success' })
        if (progress?.id) {
          setTimeout(() => {
            wx.navigateTo({
              url: `/packageProgress/pages/progress-detail/index?id=${progress.id}`
            })
          }, 500)
        }
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

    this.setData({
      campDetail: {
        ...this.data.campDetail,
        hasProgress: true
      }
    })
    wx.showToast({ title: '已加入进展', icon: 'success' })
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
    // 打开原文链接
    const { sourceUrl } = this.data.campDetail;
    wx.openUrl({
      url: sourceUrl,
      success: () => {
        console.log('打开原文链接成功');
      },
      fail: (err) => {
        console.error('打开原文链接失败:', err);
        wx.showToast({
          title: '打开链接失败，请稍后重试',
          icon: 'none'
        });
      }
    });
  },

  enrichMaterials(materials) {
    const presets = {
      '个人简历': '包含教育背景、科研/项目/竞赛经历、技能与荣誉。',
      '成绩单': '大一至当前的完整成绩单，需学校盖章或教务系统证明。',
      '英语成绩证明': '四/六级、专业英语考试、托福或雅思等成绩单任选其一。',
      '获奖证书': '学科竞赛、奖学金、荣誉称号等复印件或扫描件。',
      '推荐信': '1-2封，推荐人联系方式需清晰可核验。',
      '个人陈述': '学习与科研经历、申请动机、未来规划。',
      '研究计划': '拟研究方向、问题、方法与预期成果（简要）。'
    }

    return materials.map(item => {
      if (!item) return null
      if (typeof item === 'string') {
        return {
          title: item,
          detail: presets[item] || ''
        }
      }
      const title = item.title || item.name || ''
      return {
        title,
        detail: item.detail || item.description || presets[title] || ''
      }
    }).filter(Boolean)
  },
});
