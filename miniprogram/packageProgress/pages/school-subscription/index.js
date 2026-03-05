import { progressService } from '../../../services/progress'

const DEFAULT_SUBSCRIPTION = {
  enabled: true,
  deadlineChanged: true,
  materialsChanged: true,
  admissionResultChanged: true,
  outstandingResultChanged: true
}

Page({
  data: {
    loading: true,
    useFallback: false,
    schoolList: [],
    savingMap: {},
    expandedMap: {}
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  shouldUseRemoteProgressApi() {
    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    const forceRemote = wx.getStorageSync('forceRemoteProgressApi')
    if (forceRemote === true) return true
    if (baseUrl.indexOf('tcb.qcloud.la') > -1) {
      return false
    }
    return Boolean(baseUrl)
  },

  formatSchoolItem(item = {}) {
    const subscription = {
      ...DEFAULT_SUBSCRIPTION,
      ...(item.subscription || {})
    }
    return {
      universityId: item.universityId || item.id || '',
      universityName: item.universityName || item.name || '未命名院校',
      universityLevel: item.universityLevel || item.level || '',
      subscription
    }
  },

  buildFallbackListFromSelection() {
    const byStorage = wx.getStorageSync('selectedUniversities') || []
    const byUserSelection = (wx.getStorageSync('userSelection') || {}).universities || []
    const source = Array.isArray(byStorage) && byStorage.length > 0 ? byStorage : byUserSelection
    return source
      .map(item => this.formatSchoolItem({
        universityId: item.id || '',
        universityName: item.name || '',
        universityLevel: item.level || ''
      }))
      .filter(item => item.universityId)
  },

  loadFallbackData() {
    const cache = wx.getStorageSync('schoolSubscriptionFallbackList') || []
    const fallbackList = Array.isArray(cache) && cache.length > 0
      ? cache.map(item => this.formatSchoolItem(item))
      : this.buildFallbackListFromSelection()

    this.setData({
      schoolList: fallbackList,
      loading: false,
      useFallback: true
    })
  },

  async loadData() {
    this.setData({ loading: true })

    if (!this.shouldUseRemoteProgressApi()) {
      this.loadFallbackData()
      return
    }

    try {
      const result = await progressService.getSchoolSubscriptions({
        showLoading: false,
        showError: false
      })
      const schoolList = (result || []).map(item => this.formatSchoolItem(item))
      this.setData({
        schoolList,
        loading: false,
        useFallback: false
      })
      wx.setStorageSync('schoolSubscriptionFallbackList', schoolList)
    } catch (error) {
      this.loadFallbackData()
    }
  },

  onSubscriptionChange(e) {
    this.handleSubscriptionChange(e)
  },

  onToggleSchoolDetails(e) {
    const universityId = e.currentTarget.dataset.universityId
    if (!universityId) return
    const current = Boolean(this.data.expandedMap[universityId])
    this.setData({
      [`expandedMap.${universityId}`]: !current
    })
  },

  async handleSubscriptionChange(e) {
    const universityId = e.currentTarget.dataset.universityId
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    if (!universityId || !key) return
    if (this.data.savingMap[universityId]) return

    if (this.data.useFallback) {
      wx.showToast({ title: '离线模式下不可提交', icon: 'none' })
      return
    }

    const previousList = this.data.schoolList || []
    const patchData = {
      [key]: value
    }

    const nextList = previousList.map(item => {
      if (item.universityId !== universityId) {
        return item
      }
      const nextSubscription = {
        ...item.subscription,
        [key]: value
      }
      if (key !== 'enabled' && value && !nextSubscription.enabled) {
        nextSubscription.enabled = true
        patchData.enabled = true
      }
      return {
        ...item,
        subscription: nextSubscription
      }
    })

    this.setData({
      schoolList: nextList,
      [`savingMap.${universityId}`]: true
    })

    try {
      const result = await progressService.updateSchoolSubscription(universityId, patchData, {
        showLoading: false,
        showError: false
      })
      if (result && typeof result === 'object') {
        const syncedList = (this.data.schoolList || []).map(item => {
          if (item.universityId !== universityId) return item
          return this.formatSchoolItem(result)
        })
        this.setData({ schoolList: syncedList })
        wx.setStorageSync('schoolSubscriptionFallbackList', syncedList)
      } else {
        wx.setStorageSync('schoolSubscriptionFallbackList', nextList)
      }
    } catch (error) {
      this.setData({ schoolList: previousList })
      wx.showToast({ title: '设置失败，已恢复', icon: 'none' })
    } finally {
      this.setData({
        [`savingMap.${universityId}`]: false
      })
    }
  }
})
