import { http } from './http'

export const authService = {
  async login(code) {
    try {
      const res = await http.post('/auth/wx-login', { code }, { showLoading: false })
      const accessToken = res?.accessToken || ''
      if (!accessToken) {
        throw new Error('登录响应缺少 accessToken')
      }

      if (res?.refreshToken) {
        wx.setStorageSync('refreshToken', res.refreshToken)
      }

      return {
        token: accessToken,
        refreshToken: res?.refreshToken || '',
        expiresIn: res?.expiresIn || '',
        userInfo: {
          id: res?.user?.id || '',
          nickname: '保研er',
          avatar: '',
          openid: ''
        }
      }
    } catch (error) {
      console.error('登录失败:', error)
      throw error
    }
  },

  async refreshToken() {
    const refreshToken = wx.getStorageSync('refreshToken')
    if (!refreshToken) {
      throw new Error('缺少 refreshToken')
    }
    return http.post('/auth/refresh', null, {
      showLoading: false,
      header: {
        Authorization: `Bearer ${refreshToken}`
      }
    })
  },

  async logout() {
    wx.removeStorageSync('refreshToken')
    return Promise.resolve(true)
  }
}
