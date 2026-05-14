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
        this.updateDisplayMeta(newVal)
        this.updateFreshness(newVal)
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
    announcementTypeClass: 'summer-camp',
    scheduleLabel: '',
    scheduleText: '',
    universityLogoResolved: '',
    freshnessText: ''
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

    updateDisplayMeta(camp) {
      const schedule = this.buildScheduleDisplay(camp || {})
      const universityLogoResolved = this.resolveUniversityLogo(camp || {})
      this.setData({
        scheduleLabel: schedule.label,
        scheduleText: schedule.text,
        universityLogoResolved
      })
    },

    // β场景：公告新鲜度文本，告知用户公告距上次抓取多久了
    updateFreshness(camp) {
      const ts = camp.lastCrawledAt || camp.updatedAt
      if (!ts) {
        this.setData({ freshnessText: '' })
        return
      }
      const date = new Date(ts)
      if (Number.isNaN(date.getTime())) {
        this.setData({ freshnessText: '' })
        return
      }
      const diffMs = Date.now() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      let text = ''
      if (diffDays <= 0) text = '今日已核对'
      else if (diffDays === 1) text = '昨日已核对'
      else if (diffDays <= 7) text = `${diffDays}天前抓取`
      else if (diffDays <= 30) text = `${diffDays}天前抓取，建议查看原文`
      else text = '超过30天未更新，请以官网为准'
      this.setData({ freshnessText: text })
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
      if (Number.isNaN(date.getTime())) {
        return ''
      }
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}月${day}日`
    },

    formatDateOnly(dateString) {
      const text = String(dateString || '').trim()
      if (!text) return ''
      const date = new Date(text)
      if (Number.isNaN(date.getTime())) {
        const match = text.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/)
        if (match) {
          return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
        }
        return text.replace(/T.*$/, '').replace(/\s+\d{2}:\d{2}.*$/, '')
      }
      const year = date.getFullYear()
      const month = `${date.getMonth() + 1}`.padStart(2, '0')
      const day = `${date.getDate()}`.padStart(2, '0')
      return `${year}-${month}-${day}`
    },

    buildScheduleDisplay(camp = {}) {
      const start = this.formatDateOnly(camp.startDate)
      const end = this.formatDateOnly(camp.endDate)
      const deadline = this.formatDateOnly(camp.deadline)
      const publishDate = this.formatDateOnly(camp.publishDate)

      if (start && end) {
        return {
          label: start === end ? '举办时间' : '举办时间',
          text: start === end ? start : `${start} ~ ${end}`
        }
      }
      if (start) {
        return { label: '举办时间', text: start }
      }
      if (end) {
        return { label: '举办时间', text: end }
      }
      if (deadline) {
        return { label: '截止时间', text: deadline }
      }
      if (publishDate) {
        return { label: '发布时间', text: publishDate }
      }
      return { label: '', text: '' }
    },

    resolveUniversityLogo(camp = {}) {
      const explicitLogo = String(camp.universityLogo || '').trim()
      if (explicitLogo) {
        return explicitLogo
      }
      const website = String(camp.universityWebsite || camp.university?.website || '').trim()
      if (!website) {
        return ''
      }
      const match = website.match(/^https?:\/\/[^/]+/i)
      if (!match) {
        return ''
      }
      return `${match[0]}/favicon.ico`
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
      this.updateDisplayMeta(camp || {})
    }
  }
})
