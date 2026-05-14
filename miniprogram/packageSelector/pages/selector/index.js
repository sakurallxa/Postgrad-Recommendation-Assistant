// 院校选择页
import { selectionStore } from '../../../store/selection'
import { userStore } from '../../../store/user'
import { http } from '../../../services/http'
import { universityService } from '../../services/university'

const MACRO_REGIONS = ['华北', '华东', '华南', '华中', '西南', '西北', '东北']
const PROVINCE_REGION_MAP = {
  北京: '华北',
  天津: '华北',
  河北: '华北',
  山西: '华北',
  内蒙古: '华北',
  上海: '华东',
  江苏: '华东',
  浙江: '华东',
  安徽: '华东',
  福建: '华东',
  江西: '华东',
  山东: '华东',
  广东: '华南',
  广西: '华南',
  海南: '华南',
  河南: '华中',
  湖北: '华中',
  湖南: '华中',
  重庆: '西南',
  四川: '西南',
  贵州: '西南',
  云南: '西南',
  西藏: '西南',
  陕西: '西北',
  甘肃: '西北',
  青海: '西北',
  宁夏: '西北',
  新疆: '西北',
  辽宁: '东北',
  吉林: '东北',
  黑龙江: '东北'
}

// 常见院校名称首字到拼音首字母的兜底映射（用于后端未提供 letter/initial 时）
const FIRST_CHAR_INITIAL_MAP = {
  安: 'A',
  北: 'B',
  材: 'C',
  草: 'C',
  长: 'C',
  重: 'C',
  大: 'D',
  电: 'D',
  东: 'D',
  对: 'D',
  法: 'F',
  福: 'F',
  复: 'F',
  工: 'G',
  公: 'G',
  管: 'G',
  广: 'G',
  贵: 'G',
  国: 'G',
  哈: 'H',
  海: 'H',
  合: 'H',
  河: 'H',
  湖: 'H',
  护: 'H',
  华: 'H',
  化: 'H',
  机: 'J',
  基: 'J',
  吉: 'J',
  计: 'J',
  暨: 'J',
  建: 'J',
  江: 'J',
  教: 'J',
  空: 'K',
  控: 'K',
  口: 'K',
  兰: 'L',
  理: 'L',
  历: 'L',
  辽: 'L',
  林: 'L',
  临: 'L',
  马: 'M',
  美: 'M',
  南: 'N',
  内: 'N',
  宁: 'N',
  农: 'N',
  青: 'Q',
  清: 'Q',
  软: 'R',
  厦: 'X',
  山: 'S',
  陕: 'S',
  上: 'S',
  设: 'S',
  社: 'S',
  生: 'S',
  石: 'S',
  首: 'S',
  兽: 'S',
  数: 'S',
  水: 'S',
  四: 'S',
  苏: 'S',
  太: 'T',
  体: 'T',
  天: 'T',
  通: 'T',
  同: 'T',
  统: 'T',
  土: 'T',
  外: 'W',
  武: 'W',
  物: 'W',
  西: 'X',
  戏: 'X',
  心: 'X',
  新: 'X',
  畜: 'X',
  延: 'Y',
  药: 'Y',
  艺: 'Y',
  音: 'Y',
  应: 'Y',
  园: 'Y',
  云: 'Y',
  哲: 'Z',
  浙: 'Z',
  郑: 'Z',
  政: 'Z',
  植: 'Z',
  中: 'Z',
  作: 'Z'
}

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
    provinceFilters: [
      { label: '全部', value: '' }
    ],
    
    // 选中的筛选条件
    selectedRegion: '',
    selectedLevel: '',
    selectedProvince: '',
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
    if (!this.hasAuthToken()) {
      this.redirectToLogin()
      return
    }
    this.loadUniversities();
    this.initSelectedUniversities();
    this.loadUserSelection();
  },

  hasAuthToken() {
    return Boolean(userStore.token || wx.getStorageSync('token'))
  },

  redirectToLogin() {
    wx.showModal({
      title: '需要先登录',
      content: '登录后关注院校会保存到你的账号，换设备或重新进入也能同步。',
      confirmText: '去登录',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/my/my' })
          return
        }
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/index/index' })
        })
      }
    })
  },

  // 初始化已选院校
  initSelectedUniversities() {
    this.setData({
      selectedUniversities: selectionStore.selectedUniversities || []
    });
  },

  async loadUserSelection() {
    try {
      const selection = await http.get('/user/selection', null, {
        showLoading: false,
        showError: false
      });
      const universities = selection?.universities || [];
      selectionStore.setSelection(universities, selection?.majors || []);
      wx.setStorageSync('userSelection', {
        universities,
        majors: selection?.majors || []
      });
      this.setData({ selectedUniversities: universities }, () => {
        this.refreshUniversitySelectionState();
      });
    } catch (error) {
      // 保留本地已选状态，避免短暂网络错误导致页面闪空
    }
  },

  // 加载院校列表
  async loadUniversities() {
    this.setData({ loading: true });
    try {
      const result = await universityService.getUniversityList();
      const universities = result.list.map(item => ({
        ...item,
        province: this.resolveProvince(item),
        region: this.resolveRegion(item),
        letter: this.resolveLetter(item)
      }));
      this.setData({
        universities,
        provinceFilters: this.buildProvinceFilters(universities)
      });
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
    const filtered = this.getSortedUniversities(this.filterUniversities())
      .map(university => this.withSelectionState(university));
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
      .sort((a, b) => this.compareGroupLetter(a, b))
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
    const {
      universities,
      selectedRegion,
      selectedLevel,
      selectedProvince,
      searchKeyword
    } = this.data;
    
    return universities.filter(university => {
      // 地区筛选
      if (selectedRegion && university.region !== selectedRegion) {
        return false;
      }

      // 省份筛选
      if (selectedProvince && university.province !== selectedProvince) {
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

  // 省份筛选点击
  onProvinceFilterTap(e) {
    this.setData({
      selectedProvince: e.currentTarget.dataset.value
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
    const targetId = String(id)
    return this.data.selectedUniversities.some(u => String(u.id) === targetId);
  },

  withSelectionState(university) {
    // MVP β: 5所重点校（数据完整度有承诺）
    const PRIORITY_SCHOOLS = ['pku', 'sjtu', 'fudan', 'ustc', 'ruc'];
    const universityId = (university.id || '').toLowerCase();
    return {
      ...university,
      isSelected: this.isUniversitySelected(university.id),
      isPriority: PRIORITY_SCHOOLS.includes(universityId)
    };
  },

  refreshUniversitySelectionState() {
    const groupedUniversities = (this.data.groupedUniversities || []).map(group => ({
      ...group,
      universities: (group.universities || []).map(university => this.withSelectionState(university))
    }));

    this.setData({ groupedUniversities });
  },

  // 院校点击
  onUniversityTap(e) {
    if (!this.hasAuthToken()) {
      this.redirectToLogin();
      return;
    }

    const universityId = String(e.currentTarget.dataset.id);
    const university = this.data.universities.find(u => String(u.id) === universityId);
    
    if (!university) return;
    
    let selectedUniversities = [...this.data.selectedUniversities];
    const index = selectedUniversities.findIndex(u => String(u.id) === universityId);
    
    if (index > -1) {
      // 取消选择
      selectedUniversities.splice(index, 1);
    } else {
      // 选择
      selectedUniversities.push(university);
    }
    
    this.setData({
      selectedUniversities
    }, () => {
      this.refreshUniversitySelectionState();
    });
  },

  // 移除已选院校
  onRemoveSelectedUniversity(e) {
    const universityId = String(e.currentTarget.dataset.id);
    const selectedUniversities = this.data.selectedUniversities.filter(
      u => String(u.id) !== universityId
    );
    
    this.setData({
      selectedUniversities
    }, () => {
      this.refreshUniversitySelectionState();
    });
  },

  onClearSelectedUniversities() {
    if (this.data.selectedUniversities.length === 0) return
    wx.showModal({
      title: '清空已选院校',
      content: '确认清空当前已选院校吗？',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ selectedUniversities: [] }, () => {
          this.refreshUniversitySelectionState()
        })
      }
    })
  },

  // 确认选择
  async onConfirmSelection() {
    if (!this.hasAuthToken()) {
      this.redirectToLogin();
      return;
    }

    const selectedUniversities = this.data.selectedUniversities;
    const universityIds = selectedUniversities.map(item => item.id).filter(Boolean);

    try {
      const selection = await http.put('/user/selection', {
        universityIds,
        majorIds: []
      }, {
        showError: false
      });
      const universities = selection?.universities || selectedUniversities;
      const majors = selection?.majors || [];

      // 保存后端确认后的账号选择到状态管理和本地缓存，供首页筛选读取
      selectionStore.setSelection(universities, majors);
      wx.setStorageSync('userSelection', {
        universities,
        majors
      });

      wx.showToast({
        title: `已关注 ${universities.length} 所院校`,
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      wx.showToast({
        title: error?.message || '保存失败，请重试',
        icon: 'none'
      });
    }
  },

  // 生成省份筛选项
  buildProvinceFilters(universities) {
    const provinces = universities
      .map(university => university.province)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .sort((a, b) => this.compareUniversityName({ name: a }, { name: b }));

    return [{ label: '全部', value: '' }].concat(
      provinces.map(province => ({ label: province, value: province }))
    );
  },

  // 统一院校排序（中文按拼音顺序）
  getSortedUniversities(universities) {
    return universities.slice().sort((a, b) => this.compareUniversityName(a, b));
  },

  compareUniversityName(a, b) {
    const aName = (a.name || '').trim();
    const bName = (b.name || '').trim();

    const aLetter = this.resolveLetter(a);
    const bLetter = this.resolveLetter(b);
    if (aLetter !== bLetter) {
      return aLetter.localeCompare(bLetter);
    }

    try {
      return aName.localeCompare(bName, 'zh-Hans-CN-u-co-pinyin');
    } catch (error) {
      return aName.localeCompare(bName, 'zh-Hans-CN');
    }
  },

  compareGroupLetter(a, b) {
    if (a === '#' && b !== '#') return 1;
    if (a !== '#' && b === '#') return -1;
    return this.compareUniversityName({ name: a }, { name: b });
  },

  resolveLetter(item) {
    const rawLetter = String(item.letter || item.initial || '').trim().toUpperCase();
    if (/^[A-Z]$/.test(rawLetter)) {
      return rawLetter;
    }

    const firstChar = String(item.name || '').trim().charAt(0).toUpperCase();
    if (/^[A-Z]$/.test(firstChar)) {
      return firstChar;
    }

    if (firstChar && FIRST_CHAR_INITIAL_MAP[firstChar]) {
      return FIRST_CHAR_INITIAL_MAP[firstChar];
    }

    return '#';
  },

  resolveProvince(item) {
    const province = String(item.province || '').trim();
    if (province) {
      return province;
    }

    const region = String(item.region || '').trim();
    if (region && !MACRO_REGIONS.includes(region)) {
      return region;
    }

    return '';
  },

  resolveRegion(item) {
    const region = String(item.region || '').trim();
    if (MACRO_REGIONS.includes(region)) {
      return region;
    }

    const province = this.resolveProvince(item);
    return PROVINCE_REGION_MAP[province] || '';
  }
});
