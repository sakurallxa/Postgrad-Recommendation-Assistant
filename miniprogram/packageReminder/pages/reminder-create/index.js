// 提醒创建页
import { reminderService } from '../../services/reminder'
import { campService } from '../../services/camp'

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
    formattedCustomDateTime: '',
    minDateTime: '',
    
    // 提醒方式
    wechatReminder: true,
    appReminder: true,
    
    // 提交状态
    submitting: false
  },

  async onLoad(options) {
    // 设置时间选择器的最小时间（当前时间）
    const now = new Date();
    const minDateTime = now.toISOString().slice(0, 16);
    this.setData({ minDateTime });
    
    // 获取页面参数
    if (options.campId) {
      await this.loadCampInfo(options.campId);
    } else {
      wx.showToast({
        title: '缺少夏令营信息',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 加载夏令营信息
  async loadCampInfo(campId) {
    try {
      const camp = await campService.getCampDetail(campId);
      
      this.setData({
        campInfo: {
          id: camp.id,
          title: camp.title,
          deadline: camp.deadline,
          universityName: camp.university?.name || ''
        }
      });
      
      // 设置默认提醒时间（截止前3天）
      this.updateRemindTime(3);
    } catch (error) {
      console.error('加载夏令营信息失败:', error);
      wx.showToast({
        title: '加载夏令营信息失败',
        icon: 'none'
      });
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
    const remindTime = new Date(deadline.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    const customDateTime = remindTime.toISOString().slice(0, 16);
    
    this.setData({
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime)
    });
  },

  // 快捷时间选择
  onQuickTimeTap(e) {
    const daysBefore = parseInt(e.currentTarget.dataset.value);
    this.setData({ selectedQuickTime: daysBefore });
    this.updateRemindTime(daysBefore);
  },

  // 自定义时间选择
  onCustomTimeChange(e) {
    const customDateTime = e.detail.value;
    this.setData({
      customDateTime,
      formattedCustomDateTime: this.formatDateTime(customDateTime),
      selectedQuickTime: null // 清除快捷时间选择
    });
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
      if (this.data.wechatReminder) {
        await this.requestWechatSubscription();
      }
      
      // 保存提醒
      await this.saveReminder();
    } catch (error) {
      console.error('设置提醒失败:', error);
      this.setData({ submitting: false });
    }
  },

  // 请求微信订阅授权
  requestWechatSubscription() {
    return new Promise((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: ['你的模板ID'], // 需要替换为实际的模板ID
        success: (res) => {
          const templateId = '你的模板ID';
          if (res[templateId] === 'accept') {
            resolve();
          } else {
            wx.showToast({
              title: '请授权微信订阅消息以接收提醒',
              icon: 'none'
            });
            reject(new Error('未授权订阅消息'));
          }
        },
        fail: (err) => {
          console.error('订阅消息失败:', err);
          wx.showToast({
            title: '订阅消息失败，请稍后重试',
            icon: 'none'
          });
          reject(err);
        }
      });
    });
  },

  // 保存提醒
  async saveReminder() {
    try {
      const data = {
        campId: this.data.campInfo.id,
        remindTime: this.data.customDateTime,
        wechatReminder: this.data.wechatReminder,
        appReminder: this.data.appReminder
      };
      
      await reminderService.createReminder(data);
      
      wx.showToast({
        title: '提醒设置成功',
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
  }
});