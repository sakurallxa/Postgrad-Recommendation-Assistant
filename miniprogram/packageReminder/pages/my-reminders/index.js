// 我的提醒页
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
    
    // 提醒列表（模拟数据）
    reminders: [
      {
        id: '1',
        campId: '1',
        campTitle: '清华大学计算机科学与技术系2024年优秀大学生夏令营',
        universityName: '清华大学',
        deadline: '2024-03-18',
        remindTime: '2024-03-15 09:00',
        status: 'pending',
        statusText: '待提醒'
      },
      {
        id: '2',
        campId: '2',
        campTitle: '北京大学软件与微电子学院2024年保研夏令营',
        universityName: '北京大学',
        deadline: '2024-03-22',
        remindTime: '2024-03-19 09:00',
        status: 'pending',
        statusText: '待提醒'
      },
      {
        id: '3',
        campId: '3',
        campTitle: '复旦大学人工智能研究院2024年夏令营',
        universityName: '复旦大学',
        deadline: '2024-03-30',
        remindTime: '2024-03-27 09:00',
        status: 'pending',
        statusText: '待提醒'
      },
      {
        id: '4',
        campId: '4',
        campTitle: '上海交通大学电子信息与电气工程学院2024年夏令营',
        universityName: '上海交通大学',
        deadline: '2024-03-10',
        remindTime: '2024-03-07 09:00',
        status: 'sent',
        statusText: '已提醒'
      },
      {
        id: '5',
        campId: '5',
        campTitle: '浙江大学计算机科学与技术学院2024年夏令营',
        universityName: '浙江大学',
        deadline: '2024-03-05',
        remindTime: '2024-03-02 09:00',
        status: 'expired',
        statusText: '已过期'
      }
    ],
    filteredReminders: []
  },

  onLoad() {
    this.filterReminders();
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
    this.setData({
      selectedFilter: e.currentTarget.dataset.value
    });
    this.filterReminders();
  },

  // 查看夏令营详情
  onViewCamp(e) {
    const campId = e.currentTarget.dataset.campId;
    wx.navigateTo({
      url: `/packageCamp/pages/camp-detail/index?id=${campId}`
    });
  },

  // 删除提醒
  onDeleteReminder(e) {
    const reminderId = e.currentTarget.dataset.reminderId;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个提醒吗？',
      success: (res) => {
        if (res.confirm) {
          const reminders = this.data.reminders.filter(r => r.id !== reminderId);
          this.setData({
            reminders
          });
          this.filterReminders();
          
          wx.showToast({
            title: '提醒已删除',
            icon: 'success'
          });
        }
      }
    });
  }
});