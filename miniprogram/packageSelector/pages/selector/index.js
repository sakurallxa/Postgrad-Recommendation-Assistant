// 院校选择页
Page({
  data: {
    // 筛选选项
    regionFilters: [
      { label: '全部', value: '' },
      { label: '华北', value: '华北' },
      { label: '华东', value: '华东' },
      { label: '华南', value: '华南' },
      { label: '华中', value: '华中' },
      { label: '西南', value: '西南' },
      { label: '西北', value: '西北' },
      { label: '东北', value: '东北' }
    ],
    levelFilters: [
      { label: '全部', value: '' },
      { label: '985', value: '985' },
      { label: '211', value: '211' },
      { label: '双一流', value: '双一流' },
      { label: '普通', value: '普通' }
    ],
    
    // 选中的筛选条件
    selectedRegion: '',
    selectedLevel: '',
    searchKeyword: '',
    
    // 已选院校
    selectedUniversities: [],
    isSelectedSectionExpanded: true,
    
    // 院校列表（模拟数据）
    universities: [
      { id: '1', name: '北京大学', level: '985', region: '华北', letter: 'B' },
      { id: '2', name: '清华大学', level: '985', region: '华北', letter: 'Q' },
      { id: '3', name: '复旦大学', level: '985', region: '华东', letter: 'F' },
      { id: '4', name: '上海交通大学', level: '985', region: '华东', letter: 'S' },
      { id: '5', name: '浙江大学', level: '985', region: '华东', letter: 'Z' },
      { id: '6', name: '南京大学', level: '985', region: '华东', letter: 'N' },
      { id: '7', name: '武汉大学', level: '985', region: '华中', letter: 'W' },
      { id: '8', name: '中山大学', level: '985', region: '华南', letter: 'Z' },
      { id: '9', name: '四川大学', level: '985', region: '西南', letter: 'S' },
      { id: '10', name: '西安交通大学', level: '985', region: '西北', letter: 'X' },
      { id: '11', name: '哈尔滨工业大学', level: '985', region: '东北', letter: 'H' },
      { id: '12', name: '北京师范大学', level: '985', region: '华北', letter: 'B' },
      { id: '13', name: '北京理工大学', level: '985', region: '华北', letter: 'B' },
      { id: '14', name: '东南大学', level: '985', region: '华东', letter: 'D' },
      { id: '15', name: '同济大学', level: '985', region: '华东', letter: 'T' }
    ],
    groupedUniversities: []
  },

  onLoad() {
    this.groupUniversities();
  },

  // 分组院校列表
  groupUniversities() {
    const filtered = this.filterUniversities();
    const grouped = {};
    
    filtered.forEach(university => {
      const letter = university.letter;
      if (!grouped[letter]) {
        grouped[letter] = [];
      }
      grouped[letter].push(university);
    });
    
    // 转换为数组并按字母排序
    const groupedArray = Object.keys(grouped)
      .sort()
      .map(letter => ({
        letter,
        universities: grouped[letter]
      }));
    
    this.setData({
      groupedUniversities: groupedArray
    });
  },

  // 筛选院校
  filterUniversities() {
    const { universities, selectedRegion, selectedLevel, searchKeyword } = this.data;
    
    return universities.filter(university => {
      // 地区筛选
      if (selectedRegion && university.region !== selectedRegion) {
        return false;
      }
      
      // 层次筛选
      if (selectedLevel && university.level !== selectedLevel) {
        return false;
      }
      
      // 搜索筛选
      if (searchKeyword && !university.name.includes(searchKeyword)) {
        return false;
      }
      
      return true;
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
    this.groupUniversities();
  },

  // 地区筛选点击
  onRegionFilterTap(e) {
    this.setData({
      selectedRegion: e.currentTarget.dataset.value
    });
    this.groupUniversities();
  },

  // 层次筛选点击
  onLevelFilterTap(e) {
    this.setData({
      selectedLevel: e.currentTarget.dataset.value
    });
    this.groupUniversities();
  },

  // 切换已选院校区展开/收起
  toggleSelectedSection() {
    this.setData({
      isSelectedSectionExpanded: !this.data.isSelectedSectionExpanded
    });
  },

  // 检查院校是否已选
  isUniversitySelected(id) {
    return this.data.selectedUniversities.some(u => u.id === id);
  },

  // 院校点击
  onUniversityTap(e) {
    const universityId = e.currentTarget.dataset.id;
    const university = this.data.universities.find(u => u.id === universityId);
    
    if (!university) return;
    
    let selectedUniversities = [...this.data.selectedUniversities];
    const index = selectedUniversities.findIndex(u => u.id === universityId);
    
    if (index > -1) {
      // 取消选择
      selectedUniversities.splice(index, 1);
    } else {
      // 选择
      selectedUniversities.push(university);
    }
    
    this.setData({
      selectedUniversities
    });
  },

  // 移除已选院校
  onRemoveSelectedUniversity(e) {
    const universityId = e.currentTarget.dataset.id;
    const selectedUniversities = this.data.selectedUniversities.filter(u => u.id !== universityId);
    
    this.setData({
      selectedUniversities
    });
  },

  // 确认选择
  onConfirmSelection() {
    // 保存选择到本地存储
    wx.setStorageSync('selectedUniversities', this.data.selectedUniversities);
    
    // 提示用户
    wx.showToast({
      title: `已选择 ${this.data.selectedUniversities.length} 所院校`,
      icon: 'success'
    });
    
    // 返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  }
});