// 提醒创建页
import { reminderService } from '../../../services/reminder'
import { campService } from '../../../services/camp'

const REMINDER_REFRESH_TOKEN_KEY = 'myRemindersRefreshToken'

Page({
  data: {
    // 夏令营信息
    campInfo: {
      id: '',
      title: '',
      deadline: '',
      universityName: ''
    },
    
    // 快捷时间选项
    quickTimeOptions: [
      { label: '截止前3天', value: 3 },
      { label: '截止前1天', value: 1 },
      { label: '截止当天', value: 0 }
    ],
    selectedQuickTime: 3,
    
    // 自定义时间
    customDateTime: '',
    customDate: '',
    customTime: '',
    formattedCustomDateTime: '',
    minDateTime: '',
    minDate: '',
    maxDate: '2099-12-31',
    
    // 提醒方式
    wechatReminder: true,
    appReminder: true,
    
    // 提交状态
    submitting: false
  },

  async onLoad(options) {
    // 设置时间选择器的最小时间（当前时间）
    const now = new Date();
    const minDateTime = this.toDateTimeValue(now);
    this.setData({
      minDateTime,
      minDate: this.toDateValue(now)
    });

    // 获取页面参数（优先使用跳转携带的展示数据，避免不必要请求）
    if (!options.campId) {
      wx.showToast({
        title: '缺少夏令营/预推免信息',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return
    }

    const decodeValue = (value) => {
      if (!value) return ''
      try {
        return decodeURIComponent(value)
      } catch (error) {
        return value
      }
    }

    const prefilledInfo = {
      id: decodeValue(options.campId),
      title: decodeValue(options.title),
      deadline: decodeValue(options.deadline),
      universityName: decodeValue(options.universityName)
    }

    const hasPrefilledDisplay = Boolean(
      prefilledInfo.title || prefilledInfo.deadline || prefilledInfo.universityName
    )

    if (hasPrefilledDisplay) {
      this.setData({ campInfo: prefilledInfo })
      this.setMaxDateByDeadline(prefilledInfo.deadline)
      this.initDefaultRemindTime(prefilledInfo.deadline)
    }

    // 仅在后端可用环境下请求详情，避免云开发默认域名触发404噪音
    if (!hasPrefilledDisplay || this.shouldUseRemoteCampApi()) {
      await this.loadCampInfo(options.campId, hasPrefilledDisplay)
    }
  },

  shouldUseRemoteCampApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteCampApi')
    if (forceRemote === true) return true
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  initDefaultRemindTime(deadlineValue) {
    const deadline = deadlineValue ? new Date(deadlineValue) : null
    const hasValidDeadline = deadline && !Number.isNaN(deadline.getTime())
    if (hasValidDeadline) {
      this.updateRemindTime(3)
      return
    }

    // 截止日期未知时，默认设置为次日09:00
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 1)
    defaultDate.setHours(9, 0, 0, 0)
    this.setCustomDateTime(defaultDate)
  },

  // 加载夏令营信息
  async loadCampInfo(campId, silent = false) {
    if (!this.shouldUseRemoteCampApi()) {
      if (!silent) {
        this.initDefaultRemindTime(this.data.campInfo.deadline)
      }
      return
    }

    try {
      const camp = await campService.getCampDetail(campId, {
        showLoading: false,
        showError: false,
        allow404Fallback: false
      });
      
      this.setData({
        campInfo: {
          id: camp.id,
          title: camp.title || this.data.campInfo.title,
          deadline: camp.deadline || this.data.campInfo.deadline,
          universityName: camp.university?.name || this.data.campInfo.universityName || ''
        }
      });
      this.setMaxDateByDeadline(camp.deadline || this.data.campInfo.deadline)
      
      // 设置默认提醒时间（截止前3天）
      this.initDefaultRemindTime(camp.deadline || this.data.campInfo.deadline);
    } catch (error) {
      console.error('加载夏令营信息失败:', error);
      this.initDefaultRemindTime(this.data.campInfo.deadline)
      if (!silent) {
        wx.showToast({
          title: '未获取到最新详情，已使用当前信息',
          icon: 'none'
        });
      }
    }
  },

  // 格式化日期时间
  formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 更新提醒时间
  updateRemindTime(daysBefore) {
    const deadline = new Date(this.data.campInfo.deadline);
    if (Number.isNaN(deadline.getTime())) {
      this.initDefaultRemindTime('')
      return
    }
    const remindTime = new Date(deadline.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    const now = new Date()
    if (remindTime <= now) {
      // 已过截止场景，保留可自定义能力：默认给次日09:00
      this.initDefaultRemindTime('')
      return
    }
    this.setCustomDateTime(remindTime)
  },

  // 快捷时间选择
  onQuickTimeTap(e) {
    const daysBefore = parseInt(e.currentTarget.dataset.value, 10);
    this.setData({ selectedQuickTime: daysBefore });
    this.updateRemindTime(daysBefore);
  },

  // 自定义日期选择
  onCustomDateChange(e) {
    const customDate = e.detail.value;
    const customTime = this.data.customTime || '09:00'
    this.setData({ customDate, selectedQuickTime: null })
    this.syncCustomDateTime(customDate, customTime)
  },

  // 自定义时间选择
  onCustomTimeChange(e) {
    const customTime = e.detail.value;
    const customDate = this.data.customDate || this.data.minDate
    this.setData({ customTime, selectedQuickTime: null })
    this.syncCustomDateTime(customDate, customTime)
  },

  // 微信提醒开关
  onWechatReminderChange(e) {
    this.setData({ wechatReminder: e.detail.value });
  },

  // 小程序内提醒开关
  onAppReminderChange(e) {
    this.setData({ appReminder: e.detail.value });
  },

  // 取消
  onCancel() {
    wx.navigateBack();
  },

  // 确认设置
  async onConfirm() {
    // 检查是否选择了提醒方式
    if (!this.data.wechatReminder && !this.data.appReminder) {
      wx.showToast({
        title: '请至少选择一种提醒方式',
        icon: 'none'
      });
      return;
    }
    
    // 检查提醒时间是否有效
    const remindTime = new Date(this.data.customDateTime);
    const now = new Date();
    if (remindTime <= now) {
      wx.showToast({
        title: '提醒时间必须大于当前时间',
        icon: 'none'
      });
      return;
    }
    
    // 防止重复提交
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    
    try {
      // 如果选择了微信提醒，请求订阅授权
      let wechatReminderEnabled = this.data.wechatReminder
      if (this.data.wechatReminder) {
        const granted = await this.requestWechatSubscription();
        if (!granted) {
          wechatReminderEnabled = false
          // 微信订阅不可用时，自动保留站内提醒，避免用户白操作
          if (!this.data.appReminder) {
            this.setData({ appReminder: true })
            wx.showToast({
              title: '未配置微信模板，已自动切换为站内提醒',
              icon: 'none'
            })
          }
        }
      }
      
      // 保存提醒
      await this.saveReminder({
        wechatReminder: wechatReminderEnabled,
        appReminder: this.data.appReminder || !wechatReminderEnabled
      });
    } catch (error) {
      console.error('设置提醒失败:', error);
      this.setData({ submitting: false });
    }
  },

  // 请求微信订阅授权
  requestWechatSubscription() {
    const templateId = this.getSubscribeTemplateId()
    if (!templateId) {
      // 模板ID未配置时不阻断主流程
      return Promise.resolve(false)
    }

    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [templateId],
        success: (res) => {
          if (res[templateId] === 'accept') {
            resolve(true);
          } else {
            resolve(false);
          }
        },
        fail: (err) => {
          console.error('订阅消息失败:', err);
          // 不阻断保存提醒
          resolve(false);
        }
      });
    });
  },

  getSubscribeTemplateId() {
    const app = getApp()
    const fromStorage = wx.getStorageSync('wxSubscribeTemplateId')
    const fromGlobal = app?.globalData?.wxSubscribeTemplateId
    const candidate = fromStorage || fromGlobal || ''
    if (!candidate || candidate === '你的模板ID') {
      return ''
    }
    return candidate
  },

  // 保存提醒
  async saveReminder(overrides = {}) {
    try {
      const data = {
        campId: this.data.campInfo.id,
        remindTime: this.data.customDateTime,
        wechatReminder: overrides.wechatReminder ?? this.data.wechatReminder,
        appReminder: overrides.appReminder ?? this.data.appReminder,
        campSnapshot: {
          title: this.data.campInfo.title,
          deadline: this.data.campInfo.deadline,
          universityName: this.data.campInfo.universityName
        }
      };
      
      const createdReminder = await reminderService.createReminder(data);

      // 回写上一页详情态，保证返回后按钮立即更新
      this.syncReminderStateToPreviousPage()

      // 通知“我的提醒”页在下次 onShow 时刷新（避免每次返回都全量刷新）
      wx.setStorageSync(REMINDER_REFRESH_TOKEN_KEY, Date.now())
      
      wx.showToast({
        title: createdReminder?.__local ? '提醒已保存（本地）' : '提醒设置成功',
        icon: 'success'
      });
      
      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      console.error('保存提醒失败:', error);
      wx.showToast({
        title: '设置失败，请重试',
        icon: 'none'
      });
      this.setData({ submitting: false });
    }
  },

  syncReminderStateToPreviousPage() {
    const campId = this.data.campInfo.id
    if (!campId) return

    // 本地兜底缓存：用于离线展示或接口不可用场景
    const reminderCampIds = wx.getStorageSync('reminderCampIds') || []
    if (!reminderCampIds.includes(campId)) {
      reminderCampIds.push(campId)
      wx.setStorageSync('reminderCampIds', reminderCampIds)
    }

    const pages = getCurrentPages()
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    if (!previousPage || !previousPage.data || !previousPage.data.campDetail) {
      return
    }

    if (previousPage.data.campDetail.id === campId) {
      previousPage.setData({
        campDetail: {
          ...previousPage.data.campDetail,
          hasReminder: true
        }
      })
    }
  },

  toDateValue(date) {
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  toTimeValue(date) {
    const h = `${date.getHours()}`.padStart(2, '0')
    const min = `${date.getMinutes()}`.padStart(2, '0')
    return `${h}:${min}`
  },

  toDateTimeValue(date) {
    return `${this.toDateValue(date)}T${this.toTimeValue(date)}`
  },

  setCustomDateTime(date) {
    const customDate = this.toDateValue(date)
    const customTime = this.toTimeValue(date)
    const customDateTime = this.toDateTimeValue(date)
    this.setData({
      customDate,
      customTime,
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    })
  },

  syncCustomDateTime(customDate, customTime) {
    if (!customDate || !customTime) return
    const customDateTime = `${customDate}T${customTime}`
    this.setData({
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    })
  },

  setMaxDateByDeadline(deadlineValue) {
    const deadline = deadlineValue ? new Date(deadlineValue) : null
    if (!deadline || Number.isNaN(deadline.getTime())) {
      this.setData({ maxDate: '2099-12-31' })
      return
    }
    const now = new Date()
    if (deadline <= now) {
      // 截止已过，不限制上限，允许用户自定义未来提醒
      this.setData({ maxDate: '2099-12-31' })
      return
    }
    this.setData({ maxDate: this.toDateValue(deadline) })
  }
});
