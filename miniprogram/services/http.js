import { userStore } from '../store/user'

class HttpClient {
  constructor() {
    this.requestQueue = new Map()
  }

  async request(config) {
    const { url, method = 'GET', data, header = {}, showLoading = true, showError = true } = config

    const requestKey = `${method}-${url}`
    if (this.requestQueue.has(requestKey)) {
      return Promise.reject(new Error('重复请求'))
    }
    this.requestQueue.set(requestKey, true)

    if (showLoading) {
      wx.showLoading({ title: '加载中...', mask: true })
    }

    try {
      const token = userStore.token
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...header
      }

      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: `https://api.baoyan.com/v1${url}`,
          method,
          data,
          header: headers,
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data)
            } else if (res.statusCode === 401) {
              this.handleUnauthorized()
              reject(new Error('登录已过期'))
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: (err) => {
            reject(new Error(err.errMsg || '网络请求失败'))
          }
        })
      })

      if (response.code !== 0) {
        throw new Error(response.message || '请求失败')
      }

      return response.data
    } catch (error) {
      if (showError) {
        wx.showToast({
          title: error.message || '请求失败',
          icon: 'none',
          duration: 2000
        })
      }
      throw error
    } finally {
      this.requestQueue.delete(requestKey)
      if (showLoading) {
        wx.hideLoading()
      }
    }
  }

  handleUnauthorized() {
    userStore.logout()
    wx.navigateTo({ url: '/pages/index/index' })
  }

  get(url, params, config) {
    const queryString = params ? this.buildQueryString(params) : ''
    return this.request({
      url: queryString ? `${url}?${queryString}` : url,
      method: 'GET',
      ...config
    })
  }

  post(url, data, config) {
    return this.request({
      url,
      method: 'POST',
      data,
      ...config
    })
  }

  put(url, data, config) {
    return this.request({
      url,
      method: 'PUT',
      data,
      ...config
    })
  }

  delete(url, config) {
    return this.request({
      url,
      method: 'DELETE',
      ...config
    })
  }

  buildQueryString(params) {
    return Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}=${value.join(',')}`
        }
        return `${key}=${encodeURIComponent(value)}`
      })
      .join('&')
  }
}

export const http = new HttpClient()