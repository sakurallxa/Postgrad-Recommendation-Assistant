import { subscriptionService } from '../../../services/subscription'

// 39 所 985 拼音首字母映射（用于排序+搜索）
const SCHOOL_PINYIN_MAP = {
  '北京大学': { letter: 'B', full: 'beijingdaxue', short: 'bjdx' },
  '北京航空航天大学': { letter: 'B', full: 'beijinghangkonghangtian', short: 'bjhkht' },
  '北京理工大学': { letter: 'B', full: 'beijinglgdx', short: 'bjlg' },
  '北京师范大学': { letter: 'B', full: 'beijingshifandaxue', short: 'bjsf' },
  '大连理工大学': { letter: 'D', full: 'dalianligong', short: 'dllg' },
  '电子科技大学': { letter: 'D', full: 'dianzikejidaxue', short: 'dzkj' },
  '东北大学': { letter: 'D', full: 'dongbeidaxue', short: 'dbdx' },
  '东南大学': { letter: 'D', full: 'dongnandaxue', short: 'dndx' },
  '复旦大学': { letter: 'F', full: 'fudandaxue', short: 'fddx' },
  '国防科技大学': { letter: 'G', full: 'guofangkejidaxue', short: 'gfkj' },
  '哈尔滨工业大学': { letter: 'H', full: 'haerbingongye', short: 'hagy' },
  '湖南大学': { letter: 'H', full: 'hunandaxue', short: 'hndx' },
  '华东师范大学': { letter: 'H', full: 'huadongshifandaxue', short: 'hdsf' },
  '华南理工大学': { letter: 'H', full: 'huananligong', short: 'hnlg' },
  '华中科技大学': { letter: 'H', full: 'huazhongkejidaxue', short: 'hzkj' },
  '吉林大学': { letter: 'J', full: 'jilindaxue', short: 'jldx' },
  '兰州大学': { letter: 'L', full: 'lanzhoudaxue', short: 'lzdx' },
  '南京大学': { letter: 'N', full: 'nanjingdaxue', short: 'njdx' },
  '南开大学': { letter: 'N', full: 'nankaidaxue', short: 'nkdx' },
  '清华大学': { letter: 'Q', full: 'qinghuadaxue', short: 'qhdx' },
  '厦门大学': { letter: 'S', full: 'xiamendaxue', short: 'xmdx' }, // 厦读 xià，但小程序按俗称 X
  '山东大学': { letter: 'S', full: 'shandongdaxue', short: 'sddx' },
  '上海交通大学': { letter: 'S', full: 'shanghaijiaotong', short: 'shjt' },
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
  '中央民族大学': { letter: 'Z', full: 'zhongyangminzu', short: 'zymz' },
  '中南大学': { letter: 'Z', full: 'zhongnandaxue', short: 'zndx' },
  '中山大学': { letter: 'Z', full: 'zhongshandaxue', short: 'zsdx' },
  '重庆大学': { letter: 'C', full: 'chongqingdaxue', short: 'cqdx' }
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
    scrollIntoView: ''
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
        const pinyin = SCHOOL_PINYIN_MAP[school.universityName] || { letter: '#', full: '', short: '' }
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

  // ============ 搜索 ============
  onSearchInput(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase()
    this.setData({ keyword })
    this.applyFilter(keyword)
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.applyFilter('')
  },

  applyFilter(kw) {
    if (!kw) {
      this.setData({ filteredSchools: this.data.schools })
      return
    }
    const filtered = this.data.schools.filter(s => {
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
  onTapLetter(e) {
    const letter = e.currentTarget.dataset.letter
    if (!letter) return
    // 找到该字母下第一所学校的 slug 作为 scrollIntoView 目标
    const target = this.data.filteredSchools.find(s => s.firstLetter === letter)
    if (target) {
      this.setData({
        activeLetter: letter,
        scrollIntoView: 'school-' + target.schoolSlug
      })
      // 250ms 后清空 scrollIntoView，下一次点同字母才会重新触发
      setTimeout(() => this.setData({ scrollIntoView: '' }), 250)
    }
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
