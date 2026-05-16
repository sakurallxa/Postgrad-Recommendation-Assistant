import { subscriptionService } from '../../../services/subscription'

// 39 所 985 + 11 所新增（分校区/医学/双一流）的拼音映射
// 用于：1) 列表按首字母排序  2) 字母索引 sidebar  3) 拼音搜索
const SCHOOL_PINYIN_MAP = {
  '北京大学': { letter: 'B', full: 'beijingdaxue', short: 'bjdx' },
  '北京航空航天大学': { letter: 'B', full: 'beijinghangkonghangtian', short: 'bjhkht' },
  '北京理工大学': { letter: 'B', full: 'beijinglgdx', short: 'bjlg' },
  '北京师范大学': { letter: 'B', full: 'beijingshifandaxue', short: 'bjsf' },
  '北京协和医学院': { letter: 'B', full: 'beijingxiehe', short: 'bjxh' },
  '大连理工大学': { letter: 'D', full: 'dalianligong', short: 'dllg' },
  '电子科技大学': { letter: 'D', full: 'dianzikejidaxue', short: 'dzkj' },
  '东北大学': { letter: 'D', full: 'dongbeidaxue', short: 'dbdx' },
  '东南大学': { letter: 'D', full: 'dongnandaxue', short: 'dndx' },
  '复旦大学': { letter: 'F', full: 'fudandaxue', short: 'fddx' },
  '广州医科大学': { letter: 'G', full: 'guangzhouyike', short: 'gzyk' },
  '国防科技大学': { letter: 'G', full: 'guofangkejidaxue', short: 'gfkj' },
  '哈尔滨工业大学': { letter: 'H', full: 'haerbingongye', short: 'hagy' },
  '哈尔滨工业大学（威海）': { letter: 'H', full: 'haerbingongyeweihai', short: 'hagywh' },
  '哈尔滨工业大学（深圳）': { letter: 'H', full: 'haerbingongyeshenzhen', short: 'hagysz' },
  '湖南大学': { letter: 'H', full: 'hunandaxue', short: 'hndx' },
  '华东师范大学': { letter: 'H', full: 'huadongshifandaxue', short: 'hdsf' },
  '华南理工大学': { letter: 'H', full: 'huananligong', short: 'hnlg' },
  '华中科技大学': { letter: 'H', full: 'huazhongkejidaxue', short: 'hzkj' },
  '吉林大学': { letter: 'J', full: 'jilindaxue', short: 'jldx' },
  '暨南大学': { letter: 'J', full: 'jinandaxue', short: 'jndx' },
  '兰州大学': { letter: 'L', full: 'lanzhoudaxue', short: 'lzdx' },
  '南京大学': { letter: 'N', full: 'nanjingdaxue', short: 'njdx' },
  '南开大学': { letter: 'N', full: 'nankaidaxue', short: 'nkdx' },
  '南方科技大学': { letter: 'N', full: 'nanfangkeji', short: 'nfkj' },
  '清华大学': { letter: 'Q', full: 'qinghuadaxue', short: 'qhdx' },
  '厦门大学': { letter: 'S', full: 'xiamendaxue', short: 'xmdx' },
  '山东大学': { letter: 'S', full: 'shandongdaxue', short: 'sddx' },
  '山东大学（威海）': { letter: 'S', full: 'shandongdaxueweihai', short: 'sddxwh' },
  '上海交通大学': { letter: 'S', full: 'shanghaijiaotong', short: 'shjt' },
  '上海科技大学': { letter: 'S', full: 'shanghaikeji', short: 'shkj' },
  '上海财经大学': { letter: 'S', full: 'shanghaicaijing', short: 'shcj' },
  '四川大学': { letter: 'S', full: 'sichuandaxue', short: 'scdx' },
  '同济大学': { letter: 'T', full: 'tongjidaxue', short: 'tjdx' },
  '天津大学': { letter: 'T', full: 'tianjindaxue', short: 'tjdx2' },
  '武汉大学': { letter: 'W', full: 'wuhandaxue', short: 'whdx' },
  '西安交通大学': { letter: 'X', full: 'xianjiaotong', short: 'xjt' },
  '西北工业大学': { letter: 'X', full: 'xibeigongye', short: 'xbgy' },
  '西北农林科技大学': { letter: 'X', full: 'xibeinonglinkeji', short: 'xbnl' },
  '浙江大学': { letter: 'Z', full: 'zhejiangdaxue', short: 'zjdx' },
  '中国农业大学': { letter: 'Z', full: 'zhongguonongye', short: 'zgny' },
  '中国海洋大学': { letter: 'Z', full: 'zhongguohaiyang', short: 'zghy' },
  '中国人民大学': { letter: 'Z', full: 'zhongguorenmin', short: 'zgrm' },
  '中国科学技术大学': { letter: 'Z', full: 'zhongguokeji', short: 'zgkj' },
  '中国科学院': { letter: 'Z', full: 'zhongguokexueyuan', short: 'zgkxy' },
  '中国科学院大学': { letter: 'Z', full: 'zhongguokexueyuandaxue', short: 'zgkxydx' },
  '中央民族大学': { letter: 'Z', full: 'zhongyangminzu', short: 'zymz' },
  '中南大学': { letter: 'Z', full: 'zhongnandaxue', short: 'zndx' },
  '中山大学': { letter: 'Z', full: 'zhongshandaxue', short: 'zsdx' },
  '重庆大学': { letter: 'C', full: 'chongqingdaxue', short: 'cqdx' }
}

// 兜底：中文首字 → 字母索引（覆盖所有 211/双一流/普通高校的首字母排序）
// 列表里没有的学校，按学校名第一个汉字推断首字母（保证 Z 之外的字母 bucket 都有内容）
const FIRST_CHAR_TO_LETTER = {
  '安': 'A', '澳': 'A',
  '北': 'B',
  '长': 'C', '成': 'C', '常': 'C', '重': 'C',
  '大': 'D', '东': 'D', '电': 'D', '都': 'D',
  '俄': 'E',
  '复': 'F', '福': 'F', '佛': 'F',
  '广': 'G', '贵': 'G', '甘': 'G', '国': 'G', '高': 'G', '桂': 'G',
  '哈': 'H', '河': 'H', '湖': 'H', '海': 'H', '杭': 'H', '黑': 'H', '华': 'H', '合': 'H', '淮': 'H',
  '济': 'J', '吉': 'J', '江': 'J', '嘉': 'J', '解': 'J', '景': 'J', '金': 'J', '军': 'J', '暨': 'J',
  '凯': 'K', '昆': 'K',
  '兰': 'L', '辽': 'L', '聊': 'L', '凉': 'L', '陆': 'L', '陇': 'L', '丽': 'L', '柳': 'L',
  '马': 'M',
  '内': 'N', '南': 'N', '宁': 'N',
  '青': 'Q', '清': 'Q', '齐': 'Q', '钦': 'Q', '泉': 'Q',
  '日': 'R',
  '上': 'S', '山': 'S', '陕': 'S', '深': 'S', '沈': 'S', '石': 'S', '苏': 'S', '四': 'S', '厦': 'S', '邵': 'S', '韶': 'S', '汕': 'S', '绍': 'S',
  '太': 'T', '天': 'T', '通': 'T', '同': 'T',
  '武': 'W', '温': 'W',
  '西': 'X', '香': 'X', '湘': 'X', '徐': 'X', '新': 'X',
  '云': 'Y', '燕': 'Y', '烟': 'Y', '阳': 'Y',
  '浙': 'Z', '中': 'Z', '郑': 'Z', '珠': 'Z'
}

function inferLetter(name) {
  if (!name) return '#'
  const first = name[0]
  return FIRST_CHAR_TO_LETTER[first] || '#'
}

Page({
  data: {
    schools: [],            // 全部学校
    filteredSchools: [],    // 搜索过滤后的展示数据
    keyword: '',
    selectedIds: [],
    selectedCount: 0,
    saving: false,
    // 已选 chip 数据：{name, schoolSlug, firstDeptName, count}
    selectedChips: [],
    // 字母索引可用项（学校列表里实际存在的字母）
    availableLetters: [],
    activeLetter: '',
    // scroll-into-view 目标
    scrollIntoView: '',
    // 院校层级过滤
    levelFilter: 'all',
    levelOptions: [
      { label: '全部', value: 'all' },
      { label: '985', value: '985' },
      { label: '211', value: '211' },
      { label: '双一流', value: '双一流' },
      { label: '其他', value: 'other' }
    ]
  },

  async onLoad() {
    await this.load()
  },

  async load() {
    try {
      const schoolsResp = await subscriptionService.listSchools()
      const selectedIds = []

      const schools = (schoolsResp?.schools || []).map((school) => {
        const departments = (school.departments || []).map((d) => {
          if (d.subscribed) selectedIds.push(d.id)
          return {
            ...d,
            majorsText: (d.majors || []).slice(0, 4).join(' · ')
          }
        })
        // 优先用 PINYIN_MAP 的精确条目；查不到则按首字符推断字母（确保 211/双一流/分校区都进对桶）
        const mapped = SCHOOL_PINYIN_MAP[school.universityName]
        const pinyin = mapped
          ? mapped
          : { letter: inferLetter(school.universityName), full: '', short: '' }
        return {
          ...school,
          departments,
          expanded: school.hasDetailedDepts && departments.some(d => d.subscribed),
          subscribedCount: departments.filter(d => d.subscribed).length,
          firstLetter: pinyin.letter,
          pinyinFull: pinyin.full,
          pinyinShort: pinyin.short
        }
      })

      // 按拼音首字母排序
      schools.sort((a, b) => {
        if (a.firstLetter !== b.firstLetter) {
          return a.firstLetter.localeCompare(b.firstLetter)
        }
        return a.pinyinFull.localeCompare(b.pinyinFull)
      })

      this.setData({
        schools,
        filteredSchools: schools,
        selectedIds,
        selectedCount: selectedIds.length,
        availableLetters: this.computeAvailableLetters(schools),
        selectedChips: this.computeChips(schools)
      })
    } catch (err) {
      wx.showToast({
        title: err?.message || '加载失败',
        icon: 'none'
      })
    }
  },

  // ============ 搜索 + 层级过滤 ============
  onSearchInput(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase()
    this.setData({ keyword })
    this.applyFilter(keyword)
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.applyFilter('')
  },

  // 点击层级过滤 chip（全部 / 985 / 211 / 双一流 / 其他）
  onTapLevel(e) {
    const value = e.currentTarget.dataset.value
    if (!value || value === this.data.levelFilter) return
    this.setData({ levelFilter: value })
    this.applyFilter(this.data.keyword)
  },

  // 单条 school 是否通过层级过滤（按国家工程包含关系：985 ⊂ 211 ⊂ 双一流）
  // 注意：levelOptions 的 value 用的是 'other' 而不是中文 '其他'，匹配时要用 'other'
  matchesLevel(school) {
    const lf = this.data.levelFilter
    if (lf === 'all') return true
    const hasBooleanFields =
      typeof school.is985 === 'boolean' ||
      typeof school.is211 === 'boolean' ||
      typeof school.isDoubleFirstClass === 'boolean'

    if (hasBooleanFields) {
      if (lf === '985') return !!school.is985
      if (lf === '211') return !!school.is211          // 自动含 985
      if (lf === '双一流') return !!school.isDoubleFirstClass  // 自动含 985+211
      if (lf === 'other') return !school.is985 && !school.is211 && !school.isDoubleFirstClass
    }
    // 兼容旧后端（无 boolean 字段时按单值 level 互斥比较）
    if (lf === 'other') return !['985', '211', '双一流'].includes(school.level)
    return school.level === lf
  },

  applyFilter(kw) {
    const lf = this.data.levelFilter
    // 1) 仅层级过滤（无关键词）
    if (!kw) {
      const list = lf === 'all'
        ? this.data.schools
        : this.data.schools.filter((s) => this.matchesLevel(s))
      this.setData({ filteredSchools: list })
      return
    }
    // 2) 关键词 + 层级双过滤
    const filtered = this.data.schools.filter(s => {
      if (!this.matchesLevel(s)) return false
      const name = s.universityName || ''
      const pinyinFull = s.pinyinFull || ''
      const pinyinShort = s.pinyinShort || ''
      return name.includes(kw) ||
        pinyinFull.includes(kw) ||
        pinyinShort.includes(kw) ||
        s.firstLetter.toLowerCase() === kw
    })
    this.setData({ filteredSchools: filtered })
  },

  // ============ 学校/院系切换 ============
  onToggleSchool(e) {
    const slug = e.currentTarget.dataset.slug
    const schools = this.data.schools.map(s =>
      s.schoolSlug === slug ? { ...s, expanded: !s.expanded } : s
    )
    this.setData({ schools })
    this.applyFilter(this.data.keyword)
  },

  onToggleDept(e) {
    const id = e.currentTarget.dataset.id
    const MAX_SELECTED = 5

    // 找当前 dept 是否已选；若未选且即将超限 → 阻断
    let isAdding = false
    for (const s of this.data.schools) {
      const d = s.departments.find(x => x.id === id)
      if (d) { isAdding = !d.subscribed; break }
    }
    if (isAdding && this.data.selectedCount >= MAX_SELECTED) {
      wx.showToast({
        title: `最多关注 ${MAX_SELECTED} 个院系`,
        icon: 'none',
        duration: 1500
      })
      return
    }

    const schools = this.data.schools.map((school) => {
      const departments = school.departments.map((d) => (
        d.id === id ? { ...d, subscribed: !d.subscribed } : d
      ))
      return {
        ...school,
        departments,
        subscribedCount: departments.filter(d => d.subscribed).length
      }
    })
    const selectedIds = []
    schools.forEach(s => s.departments.forEach(d => d.subscribed && selectedIds.push(d.id)))
    this.setData({
      schools,
      selectedIds,
      selectedCount: selectedIds.length,
      selectedChips: this.computeChips(schools)
    })
    this.applyFilter(this.data.keyword)
  },

  // 从已选院系生成 chip 列表，每所学校一个 chip
  computeChips(schools) {
    const chips = []
    for (const s of schools) {
      const picked = s.departments.filter(d => d.subscribed)
      if (picked.length === 0) continue
      chips.push({
        schoolSlug: s.schoolSlug,
        universityName: s.universityName,
        // 显示文本：第一个院系 + (+N) 形式
        displayText:
          picked.length === 1
            ? `${s.universityName} · ${picked[0].name}`
            : `${s.universityName} · ${picked[0].name} +${picked.length - 1}`,
        // 要取消所有的话，传整个院系 id 列表
        deptIds: picked.map(d => d.id),
      })
    }
    return chips
  },

  // 字母索引：扫描 schools 拿到出现过的首字母去重排序
  computeAvailableLetters(schools) {
    const set = new Set()
    for (const s of schools) {
      if (s.firstLetter) set.add(s.firstLetter)
    }
    return Array.from(set).sort()
  },

  // 点 chip 取消该校所有订阅
  onRemoveChip(e) {
    const { slug } = e.currentTarget.dataset
    const schools = this.data.schools.map((school) => {
      if (school.schoolSlug !== slug) return school
      const departments = school.departments.map(d => ({ ...d, subscribed: false }))
      return { ...school, departments, subscribedCount: 0 }
    })
    const selectedIds = []
    schools.forEach(s => s.departments.forEach(d => d.subscribed && selectedIds.push(d.id)))
    this.setData({
      schools,
      selectedIds,
      selectedCount: selectedIds.length,
      selectedChips: this.computeChips(schools)
    })
    this.applyFilter(this.data.keyword)
  },

  // 点字母 → 滚到该字母第一所学校
  // 优先级：1) 层级过滤生效内的目标  2) 全量目标 + 清掉关键词搜索
  onTapLetter(e) {
    const letter = e.currentTarget.dataset.letter
    if (!letter) return
    // 先在"层级过滤后的列表"里找；找不到再退到全量并清掉搜索
    const inLevel = this.data.schools.filter((s) => this.matchesLevel(s))
    let target = inLevel.find((s) => s.firstLetter === letter)
    const needsResetSearch = !target || this.data.keyword
    if (!target) target = this.data.schools.find((s) => s.firstLetter === letter)
    if (!target) return
    const updates = {
      activeLetter: letter,
      scrollIntoView: 'school-' + target.schoolSlug
    }
    if (needsResetSearch && this.data.keyword) {
      updates.keyword = ''
      // 清搜索后重算 filteredSchools（仅按层级过滤）
      updates.filteredSchools = this.data.schools.filter((s) => this.matchesLevel(s))
    }
    this.setData(updates)
    setTimeout(() => this.setData({ scrollIntoView: '' }), 250)
  },

  // ============ 保存（订阅 + 立即触发按需抓取作业）============
  async onSave() {
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请至少选 1 个院系', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      // 1) 保存订阅
      const result = await subscriptionService.batchSubscribe(this.data.selectedIds)
      const total = result?.totalActive || this.data.selectedIds.length

      // 2) 立即触发按需抓取作业（点对点，只抓刚选的学院）
      let job = null
      try {
        job = await subscriptionService.createCrawlJob(this.data.selectedIds, 'initial_selection')
        if (job?.jobId) {
          wx.setStorageSync('activeCrawlJobId', job.jobId)
        }
      } catch (jobErr) {
        console.warn('[dept-selector] 触发抓取作业失败', jobErr)
        // 订阅已成功；抓取失败不阻塞用户
      }

      wx.showToast({
        title: job?.jobId ? `已开始抓取 (${total} 个院系)` : `已订阅 ${total} 个院系`,
        icon: 'success',
        duration: 1500
      })

      // 3) 回首页，带上 jobId，首页会渲染进度 banner
      setTimeout(() => {
        if (job?.jobId) {
          wx.reLaunch({ url: `/pages/index/index?jobId=${job.jobId}` })
        } else {
          wx.navigateBack()
        }
      }, 1200)
    } catch (err) {
      wx.showToast({
        title: err?.message || '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
