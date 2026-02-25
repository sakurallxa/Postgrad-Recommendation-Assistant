import { http } from './http'

export const authService = {
  async login(code) {
    try {
      // 模拟API请求
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 模拟返回数据
      return {
        token: 'mock-token-' + Date.now(),
        openid: 'mock-openid-' + Date.now(),
        isNewUser: true,
        userInfo: {
          id: '1',
          nickname: '保研er',
          avatar: ''
        }
      }
    } catch (error) {
      console.error('登录失败:', error)
      throw error
    }
  },

  async refreshToken() {
    return http.post('/auth/token', { token: wx.getStorageSync('token') })
  },

  async logout() {
    return http.post('/auth/logout')
  }
}