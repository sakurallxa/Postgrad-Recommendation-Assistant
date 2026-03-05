const { normalizeAnnouncementType, ANNOUNCEMENT_TYPES } = require('../../../services/announcement')

// 夏令营卡片组件
Component({
  properties: {
    camp: {
      type: Object,
      value: {},
      observer: function(newVal) {
        if (!newVal || typeof newVal !== 'object') {
          return
        }
        this.updateAnnouncementType(newVal)
        if (newVal.deadline) {
          this.calculateDeadlineStatus(newVal.deadline)
        }
      }
    }
  },
  data: {
    daysRemaining: 0,
    deadlineText: '',
    statusClass: '',
    announcementTypeLabel: '夏令营公告',
    announcementTypeClass: 'summer-camp'
  },
  methods: {
    updateAnnouncementType(camp) {
      const normalized = normalizeAnnouncementType(camp || {})
      const isPreRecommendation = normalized.announcementType === ANNOUNCEMENT_TYPES.PRE_RECOMMENDATION
      this.setData({
        announcementTypeLabel: normalized.announcementTypeLabel,
        announcementTypeClass: isPreRecommendation ? 'pre-recommendation' : 'summer-camp'
      })
    },

    // 计算截止日期状态
    calculateDeadlineStatus(deadline) {
      const now = new Date()
      const deadlineDate = new Date(deadline)
      const diffTime = deadlineDate - now
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      let deadlineText = ''
      let statusClass = ''

      if (diffDays < 0) {
        deadlineText = '已截止'
        statusClass = 'expired'
      } else if (diffDays === 0) {
        deadlineText = '今天截止'
        statusClass = 'urgent'
      } else if (diffDays === 1) {
        deadlineText = '明天截止'
        statusClass = 'urgent'
      } else if (diffDays <= 3) {
        deadlineText = this.formatDate(deadline) + ' 截止'
        statusClass = 'urgent'
      } else if (diffDays <= 7) {
        deadlineText = this.formatDate(deadline) + ' 截止'
        statusClass = 'warning'
      } else {
        deadlineText = this.formatDate(deadline) + ' 截止'
        statusClass = 'normal'
      }

      this.setData({
        daysRemaining: diffDays,
        deadlineText: deadlineText,
        statusClass: statusClass
      })
    },

    // 格式化日期
    formatDate(dateString) {
      const date = new Date(dateString)
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}月${day}日`
    },

    // 处理卡片点击
    handleTap() {
      const normalized = normalizeAnnouncementType(this.properties.camp || {})
      this.triggerEvent('tap', {
        campId: normalized.id,
        announcementType: normalized.announcementType,
        title: normalized.title || ''
      })
    },

    // 处理设置提醒
    handleRemindTap() {
      // catchtap 已自动阻止事件冒泡，无需额外处理
      const camp = normalizeAnnouncementType(this.properties.camp || {})
      this.triggerEvent('remind', {
        campId: camp.id,
        title: camp.title || '',
        deadline: camp.deadline || '',
        universityName: camp.universityName || '',
        announcementType: camp.announcementType || ''
      })
    }
  },

  lifetimes: {
    attached() {
      // 组件挂载时计算截止日期状态
      const camp = this.properties.camp
      if (camp && typeof camp === 'object' && camp.deadline) {
        this.calculateDeadlineStatus(camp.deadline)
      }
      this.updateAnnouncementType(camp || {})
    }
  }
})
