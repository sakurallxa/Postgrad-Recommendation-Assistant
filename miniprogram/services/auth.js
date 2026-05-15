import { http } from './http'

// v0.2 本地开发：检测后端是否为 localhost，是的话用 dev-login 跳过微信
function isLocalDev() {
  try {
    const app = getApp()
    const base = app?.globalData?.apiBaseUrl || ''
    return /localhost|127\.0\.0\.1/.test(base)
  } catch (e) {
    return false
  }
}

export const authService = {
  async login(code) {
    try {
      // 本地开发模式：用 dev-login 跳过微信
      const endpoint = isLocalDev() ? '/auth/dev-login' : '/auth/wx-login'
      const payload = isLocalDev() ? {} : { code }
      const res = await http.post(endpoint, payload, { showLoading: false })
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
