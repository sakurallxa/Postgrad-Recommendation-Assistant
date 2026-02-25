// 夏令营详情页
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
      hasReminder: false
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

  loadCampDetail() {
    // 加载夏令营详情
    this.setData({ loading: true });
    
    // 模拟API请求
    setTimeout(() => {
      const mockDetail = {
        id: this.data.campId,
        universityId: '1',
        universityName: '清华大学',
        universityLogo: '',
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
        materials: [
          '个人简历',
          '成绩单',
          '英语成绩证明',
          '获奖证书',
          '推荐信',
          '个人陈述',
          '研究计划'
        ],
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
        hasReminder: false
      };
      
      this.setData({ 
        campDetail: mockDetail,
        loading: false 
      });
    }, 1000);
  },

  handleSetReminder() {
    // 设置提醒
    const { campDetail } = this.data;
    wx.navigateTo({
      url: `/packageReminder/pages/reminder-create/index?campId=${campDetail.id}&title=${encodeURIComponent(campDetail.title)}&deadline=${campDetail.deadline}&universityName=${encodeURIComponent(campDetail.universityName)}`
    });
  },

  handleCopyMaterials() {
    // 复制材料清单
    const materials = this.data.campDetail.materials;
    const materialsText = materials.join('\n');
    
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
  }
});