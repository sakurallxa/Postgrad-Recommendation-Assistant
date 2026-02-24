// 提醒创建页
Page({
  data: {
    // 夏令营信息（从页面参数获取）
    campInfo: {
      title: '',
      deadline: '',
      universityName: ''
    },
    
    // 快捷时间选项
    quickTimeOptions: [
      { label: '截止前3天', value: '3' },
      { label: '截止前1天', value: '1' },
      { label: '截止当天', value: '0' }
    ],
    selectedQuickTime: '3',
    
    // 自定义时间
    customDateTime: '',
    formattedCustomDateTime: '',
    minDateTime: '',
    
    // 提醒方式
    wechatReminder: true,
    appReminder: true
  },

  onLoad(options) {
    // 获取页面参数
    if (options.campId) {
      // 模拟获取夏令营信息
      this.setData({
        campInfo: {
          title: options.title || '夏令营名称',
          deadline: options.deadline || '2024-03-31',
          universityName: options.universityName || ''
        }
      });
    }
    
    // 设置时间选择器的最小时间（当前时间）
    const now = new Date();
    const minDateTime = now.toISOString().slice(0, 16);
    
    // 设置默认自定义时间（截止前3天）
    const deadline = new Date(this.data.campInfo.deadline);
    const defaultRemindTime = new Date(deadline.getTime() - 3 * 24 * 60 * 60 * 1000);
    const customDateTime = defaultRemindTime.toISOString().slice(0, 16);
    
    this.setData({
      minDateTime,
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    });
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

  // 快捷时间选择
  onQuickTimeTap(e) {
    const daysBefore = parseInt(e.currentTarget.dataset.value);
    this.setData({ selectedQuickTime: daysBefore.toString() });
    
    // 更新自定义时间
    const deadline = new Date(this.data.campInfo.deadline);
    const remindTime = new Date(deadline.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    const customDateTime = remindTime.toISOString().slice(0, 16);
    
    this.setData({
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    });
  },

  // 自定义时间选择
  onCustomTimeChange(e) {
    const customDateTime = e.detail.value;
    this.setData({
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    });
    
    // 清除快捷时间选择
    this.setData({ selectedQuickTime: '' });
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
  onConfirm() {
    // 检查是否选择了提醒方式
    if (!this.data.wechatReminder && !this.data.appReminder) {
      wx.showToast({
        title: '请至少选择一种提醒方式',
        icon: 'none'
      });
      return;
    }
    
    // 如果选择了微信提醒，请求订阅授权
    if (this.data.wechatReminder) {
      this.requestWechatSubscription();
    } else {
      this.saveReminder();
    }
  },

  // 请求微信订阅授权
  requestWechatSubscription() {
    wx.requestSubscribeMessage({
      tmplIds: ['你的模板ID'], // 需要替换为实际的模板ID
      success: (res) => {
        // 检查是否授权成功
        const templateId = '你的模板ID';
        if (res[templateId] === 'accept') {
          this.saveReminder();
        } else {
          wx.showToast({
            title: '请授权微信订阅消息以接收提醒',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.error('订阅消息失败:', err);
        wx.showToast({
          title: '订阅消息失败，请稍后重试',
          icon: 'none'
        });
      }
    });
  },

  // 保存提醒
  saveReminder() {
    // 模拟保存提醒
    wx.showToast({
      title: '提醒设置成功',
      icon: 'success'
    });
    
    // 返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  }
});