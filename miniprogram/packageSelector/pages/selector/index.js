// 院校选择页
import { selectionStore } from '../../../store/selection'
import { universityService } from '../../../services/university'

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
    
    // 院校列表
    universities: [],
    groupedUniversities: [],
    loading: false
  },

  onLoad() {
    this.loadUniversities();
    this.initSelectedUniversities();
  },

  // 初始化已选院校
  initSelectedUniversities() {
    this.setData({
      selectedUniversities: selectionStore.selectedUniversities
    });
  },

  // 加载院校列表
  async loadUniversities() {
    this.setData({ loading: true });
    try {
      const result = await universityService.getUniversityList();
      const universities = result.list.map(item => ({
        ...item,
        letter: item.name.charAt(0).toUpperCase()
      }));
      this.setData({ universities });
      this.groupUniversities();
    } catch (error) {
      console.error('加载院校列表失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
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
    // 保存选择到状态管理
    selectionStore.setSelection(this.data.selectedUniversities, []);
    
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