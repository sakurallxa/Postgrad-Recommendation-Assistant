import { userStore } from '../store/user'

class HttpClient {
  constructor() {
    this.requestQueue = new Map()
    this.loadingCounter = 0
  }

  getBaseUrl() {
    const app = getApp()
    const configured = app?.globalData?.apiBaseUrl
    if (configured) {
      return configured
    }
    // 兜底值，保证调试环境不触发非法域名
    return 'https://7072-prod-3gtxp94je7bc33d7-1407249275.tcb.qcloud.la/v1'
  }

  getFallbackBaseUrl(baseUrl) {
    if (typeof baseUrl !== 'string') return ''
    if (baseUrl.endsWith('/v1')) {
      return baseUrl.slice(0, -3)
    }
    return ''
  }

  showLoadingSafely() {
    this.loadingCounter += 1
    if (this.loadingCounter === 1) {
      wx.showLoading({ title: '加载中...', mask: true })
    }
  }

  hideLoadingSafely() {
    if (this.loadingCounter > 0) {
      this.loadingCounter -= 1
    }
    if (this.loadingCounter === 0) {
      try {
        wx.hideLoading()
      } catch (error) {
        // ignore hideLoading warnings in edge cases
      }
    }
  }

  async request(config) {
    const {
      url,
      method = 'GET',
      data,
      header = {},
      showLoading = true,
      showError = true,
      allow404Fallback = true,
      allow405Fallback = false
    } = config

    const requestKey = `${method}-${url}`
    if (this.requestQueue.has(requestKey)) {
      return Promise.reject(new Error('重复请求'))
    }
    this.requestQueue.set(requestKey, true)

    if (showLoading) {
      this.showLoadingSafely()
    }

    try {
      const token = userStore.token
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...header
      }

      const response = await new Promise((resolve, reject) => {
        const baseUrl = this.getBaseUrl()
        const requestUrl = `${baseUrl}${url}`
        wx.request({
          url: requestUrl,
          method,
          data,
          header: headers,
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data)
            } else if (this.shouldUseFallbackRequest({
              statusCode: res.statusCode,
              method,
              allow404Fallback,
              allow405Fallback
            })) {
              const fallbackBaseUrl = this.getFallbackBaseUrl(baseUrl)
              if (!fallbackBaseUrl) {
                reject(new Error(`请求失败: ${res.statusCode}`))
                return
              }

              wx.request({
                url: `${fallbackBaseUrl}${url}`,
                method,
                data,
                header: headers,
                success: (fallbackRes) => {
                  if (fallbackRes.statusCode === 200) {
                    resolve(fallbackRes.data)
                  } else if (fallbackRes.statusCode === 401) {
                    this.handleUnauthorized()
                    reject(new Error('登录已过期'))
                  } else {
                    reject(new Error(`请求失败: ${fallbackRes.statusCode}`))
                  }
                },
                fail: (fallbackErr) => {
                  reject(new Error(fallbackErr.errMsg || '网络请求失败'))
                }
              })
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
        this.hideLoadingSafely()
      }
    }
  }

  shouldUseFallbackRequest({ statusCode, method, allow404Fallback, allow405Fallback }) {
    if (statusCode === 404 && allow404Fallback) {
      return method === 'GET'
    }
    if (statusCode === 405 && allow405Fallback) {
      return true
    }
    return false
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

  patch(url, data, config) {
    return this.request({
      url,
      method: 'PATCH',
      data,
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
