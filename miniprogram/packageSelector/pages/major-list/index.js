// 专业列表页
Page({
  data: {
    // 学科门类筛选
    categories: [
      { label: '全部', value: '' },
      { label: '工学', value: '工学' },
      { label: '理学', value: '理学' },
      { label: '文学', value: '文学' },
      { label: '管理学', value: '管理学' },
      { label: '经济学', value: '经济学' },
      { label: '法学', value: '法学' },
      { label: '教育学', value: '教育学' },
      { label: '医学', value: '医学' },
      { label: '艺术学', value: '艺术学' }
    ],
    
    // 选中的筛选条件
    selectedCategory: '',
    searchKeyword: '',
    
    // 已选专业
    selectedMajors: [],
    isSelectedSectionExpanded: true,
    
    // 专业列表（模拟数据）
    majors: [
      { id: '1', name: '计算机科学与技术', category: '工学' },
      { id: '2', name: '软件工程', category: '工学' },
      { id: '3', name: '人工智能', category: '工学' },
      { id: '4', name: '数据科学与大数据技术', category: '工学' },
      { id: '5', name: '电子信息工程', category: '工学' },
      { id: '6', name: '通信工程', category: '工学' },
      { id: '7', name: '自动化', category: '工学' },
      { id: '8', name: '机械工程', category: '工学' },
      { id: '9', name: '土木工程', category: '工学' },
      { id: '10', name: '化学工程与工艺', category: '工学' },
      { id: '11', name: '数学与应用数学', category: '理学' },
      { id: '12', name: '物理学', category: '理学' },
      { id: '13', name: '化学', category: '理学' },
      { id: '14', name: '生物科学', category: '理学' },
      { id: '15', name: '统计学', category: '理学' },
      { id: '16', name: '汉语言文学', category: '文学' },
      { id: '17', name: '英语', category: '文学' },
      { id: '18', name: '新闻学', category: '文学' },
      { id: '19', name: '工商管理', category: '管理学' },
      { id: '20', name: '会计学', category: '管理学' },
      { id: '21', name: '市场营销', category: '管理学' },
      { id: '22', name: '金融学', category: '经济学' },
      { id: '23', name: '经济学', category: '经济学' },
      { id: '24', name: '国际经济与贸易', category: '经济学' },
      { id: '25', name: '法学', category: '法学' },
      { id: '26', name: '教育学', category: '教育学' },
      { id: '27', name: '临床医学', category: '医学' },
      { id: '28', name: '口腔医学', category: '医学' },
      { id: '29', name: '视觉传达设计', category: '艺术学' },
      { id: '30', name: '音乐学', category: '艺术学' }
    ],
    filteredMajors: []
  },

  onLoad() {
    this.filterMajors();
  },

  // 筛选专业
  filterMajors() {
    const { majors, selectedCategory, searchKeyword } = this.data;
    
    const filtered = majors.filter(major => {
      // 学科门类筛选
      if (selectedCategory && major.category !== selectedCategory) {
        return false;
      }
      
      // 搜索筛选
      if (searchKeyword && !major.name.includes(searchKeyword)) {
        return false;
      }
      
      return true;
    });
    
    this.setData({
      filteredMajors: filtered
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
    this.filterMajors();
  },

  // 学科门类筛选点击
  onCategoryTap(e) {
    this.setData({
      selectedCategory: e.currentTarget.dataset.value
    });
    this.filterMajors();
  },

  // 切换已选专业区展开/收起
  toggleSelectedSection() {
    this.setData({
      isSelectedSectionExpanded: !this.data.isSelectedSectionExpanded
    });
  },

  // 检查专业是否已选
  isMajorSelected(id) {
    return this.data.selectedMajors.some(m => m.id === id);
  },

  // 专业点击
  onMajorTap(e) {
    const majorId = e.currentTarget.dataset.id;
    const major = this.data.majors.find(m => m.id === majorId);
    
    if (!major) return;
    
    let selectedMajors = [...this.data.selectedMajors];
    const index = selectedMajors.findIndex(m => m.id === majorId);
    
    if (index > -1) {
      // 取消选择
      selectedMajors.splice(index, 1);
    } else {
      // 选择
      selectedMajors.push(major);
    }
    
    this.setData({
      selectedMajors
    });
  },

  // 移除已选专业
  onRemoveSelectedMajor(e) {
    const majorId = e.currentTarget.dataset.id;
    const selectedMajors = this.data.selectedMajors.filter(m => m.id !== majorId);
    
    this.setData({
      selectedMajors
    });
  },

  // 确认选择
  onConfirmSelection() {
    // 保存选择到本地存储
    wx.setStorageSync('selectedMajors', this.data.selectedMajors);
    
    // 提示用户
    wx.showToast({
      title: `已选择 ${this.data.selectedMajors.length} 个专业`,
      icon: 'success'
    });
    
    // 返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  }
});