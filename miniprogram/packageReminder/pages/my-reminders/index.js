// 我的提醒页
import { reminderService } from '../../../services/reminder'

Page({
  data: {
    // 筛选选项
    filterOptions: [
      { label: '全部', value: 'all' },
      { label: '待提醒', value: 'pending' },
      { label: '已提醒', value: 'sent' },
      { label: '已过期', value: 'expired' }
    ],
    selectedFilter: 'all',
    
    // 提醒列表
    reminders: [],
    filteredReminders: [],
    
    // 分页
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    
    // 首次加载
    isFirstLoad: true
  },

  onLoad() {
    this.loadReminders();
  },

  onShow() {
    // 页面显示时刷新数据
    if (!this.data.isFirstLoad) {
      this.refreshReminders();
    }
    this.setData({ isFirstLoad: false });
  },

  // 加载提醒列表
  async loadReminders() {
    if (this.data.loading || !this.data.hasMore) return;
    
    this.setData({ loading: true });
    
    try {
      const { page, limit, selectedFilter } = this.data;
      const params = {
        page,
        limit,
        status: selectedFilter
      };
      
      const result = await reminderService.getReminders(params);
      
      // 格式化提醒数据
      const formattedReminders = result.data.map(item => ({
        id: item.id,
        campId: item.campId,
        campTitle: item.camp?.title || '未知夏令营/预推免',
        universityName: item.camp?.university?.name || '未知院校',
        deadline: item.camp?.deadline || '',
        remindTime: item.remindTime,
        status: item.status,
        statusText: this.getStatusText(item.status)
      }));
      
      this.setData({
        reminders: [...this.data.reminders, ...formattedReminders],
        page: page + 1,
        hasMore: result.data.length === limit,
        loading: false
      });
      
      this.filterReminders();
    } catch (error) {
      console.error('加载提醒失败:', error);
      this.setData({ loading: false });
      
      // 如果是401错误，已经在http.js中处理
      if (error.message !== '登录已过期') {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      }
    }
  },

  // 刷新提醒列表
  async refreshReminders() {
    this.setData({
      reminders: [],
      page: 1,
      hasMore: true
    });
    await this.loadReminders();
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'pending': '待提醒',
      'sent': '已提醒',
      'failed': '发送失败',
      'expired': '已过期'
    };
    return statusMap[status] || status;
  },

  // 筛选提醒
  filterReminders() {
    const { reminders, selectedFilter } = this.data;
    
    let filtered = reminders;
    if (selectedFilter !== 'all') {
      filtered = reminders.filter(reminder => reminder.status === selectedFilter);
    }
    
    this.setData({
      filteredReminders: filtered
    });
  },

  // 筛选点击
  onFilterTap(e) {
    const selectedFilter = e.currentTarget.dataset.value;
    this.setData({
      selectedFilter,
      reminders: [],
      page: 1,
      hasMore: true
    });
    this.loadReminders();
  },

  // 查看夏令营详情
  onViewCamp(e) {
    const campId = e.currentTarget.dataset.campId;
    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?id=${campId}`
    });
  },

  // 删除提醒
  async onDeleteReminder(e) {
    const reminderId = e.currentTarget.dataset.reminderId;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个提醒吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await reminderService.deleteReminder(reminderId);
            
            // 从列表中移除
            const reminders = this.data.reminders.filter(r => r.id !== reminderId);
            this.setData({ reminders });
            this.filterReminders();
            
            wx.showToast({
              title: '提醒已删除',
              icon: 'success'
            });
          } catch (error) {
            console.error('删除提醒失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.refreshReminders().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadReminders();
  },

  // 创建新提醒
  onCreateReminder() {
    wx.navigateTo({
      url: '/packageReminder/pages/reminder-create/index'
    });
  }
});
