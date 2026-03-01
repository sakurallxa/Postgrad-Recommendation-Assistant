// 夏令营详情页
import { campService } from '../../../services/camp'
import { progressService } from '../../../services/progress'
import { normalizeAnnouncementType } from '../../../services/announcement'

Page({
  data: {
    campId: '',
    campDetail: {
      id: '',
      universityId: '',
      universityName: '',
      universityLogo: '',
      title: '',
      announcementType: 'summer_camp',
      announcementTypeLabel: '夏令营公告',
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
    const normalized = normalizeAnnouncementType({
      ...detail,
      universityId: detail.universityId || detail.university?.id || '',
      universityName: detail.universityName || detail.university?.name || '',
      universityLogo: detail.universityLogo || detail.university?.logo || '',
    })
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
      materials: this.enrichMaterials([
        '个人简历',
        '成绩单',
        '英语成绩证明',
        '获奖证书',
        '推荐信',
        '个人陈述',
        '研究计划'
      ]),
      process,
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
        await progressService.createProgress({ campId }, {
          showLoading: false,
          showError: false
        })
        this.setData({
          campDetail: {
            ...this.data.campDetail,
            hasProgress: true
          }
        })
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

    this.setData({
      campDetail: {
        ...this.data.campDetail,
        hasProgress: true
      }
    })
    this.showFollowAddedNotice()
  },

  showFollowAddedNotice() {
    wx.showModal({
      title: '已添加关注',
      content: '已添加关注，后续入营名单公布、优秀学员公布等信息将通过微信订阅消息实时提醒你',
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
