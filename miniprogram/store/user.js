import { observable, action, computed } from 'mobx-miniprogram'
import { selectionStore } from './selection'

class UserStore {
  constructor() {
    this.initFromStorage()
  }

  @observable
  userInfo = null

  @observable
  token = ''

  @observable
  isLoggedIn = false

  @observable
  selection = null

  @computed
  get userId() {
    return this.userInfo?.id || ''
  }

  @computed
  get selectedUniversityIds() {
    return this.selection?.universityIds || []
  }

  @computed
  get selectedMajorIds() {
    return this.selection?.majorIds || []
  }

  @action
  setUserInfo(userInfo) {
    this.userInfo = userInfo
    this.isLoggedIn = true
    wx.setStorageSync('userInfo', userInfo || null)
    wx.setStorageSync('isLoggedIn', true)
  }

  @action
  setToken(token) {
    this.token = token
    wx.setStorageSync('token', token)
  }

  @action
  setSelection(selection) {
    this.selection = selection
  }

  @action
  logout() {
    this.userInfo = null
    this.token = ''
    this.isLoggedIn = false
    this.selection = null
    selectionStore.clearAll()
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('isLoggedIn')
    wx.removeStorageSync('refreshToken')
    wx.removeStorageSync('selectedUniversities')
    wx.removeStorageSync('selectedMajors')
    wx.removeStorageSync('userSelection')
    wx.removeStorageSync('schoolSubscriptionFallbackList')
  }

  initFromStorage() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    const isLoggedIn = wx.getStorageSync('isLoggedIn')
    if (token) {
      this.token = token
    }
    if (userInfo && typeof userInfo === 'object') {
      this.userInfo = userInfo
    }
    if (token && userInfo && isLoggedIn) {
      this.isLoggedIn = true
    }
  }
}

export const userStore = new UserStore()
