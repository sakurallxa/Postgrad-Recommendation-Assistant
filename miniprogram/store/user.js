import { observable, action, computed } from 'mobx-miniprogram'

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
    wx.removeStorageSync('token')
    wx.removeStorageSync('refreshToken')
  }

  initFromStorage() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.token = token
    }
  }
}

export const userStore = new UserStore()
