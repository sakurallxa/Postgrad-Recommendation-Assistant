import { userStore } from '../store/user'

class HttpClient {
  constructor() {
    this.requestQueue = new Map()
    this.loadingCounter = 0
    this.loginPromise = null
  }

  /**
   * 自动登录（去重并发请求）
   * 本地开发走 /auth/dev-login，生产走 wx.login + /auth/wx-login
   */
  async ensureToken() {
    // 已有 token 直接返回
    if (userStore.token) { console.log('[http] ensureToken: hit userStore.token'); return userStore.token }
    const cached = wx.getStorageSync('token')
    if (cached) {
      console.log('[http] ensureToken: hit storage token')
      userStore.setToken && userStore.setToken(cached)
      return cached
    }
    // 用户主动退出后，禁止自动登录，直到用户显式触发 login()
    if (wx.getStorageSync('disableAutoLogin')) {
      console.log('[http] ensureToken: blocked by disableAutoLogin')
      return ''
    }
    // 并发请求合并到同一个登录 Promise
    if (this.loginPromise) { console.log('[http] ensureToken: reuse in-flight loginPromise'); return this.loginPromise }

    console.log('[http] ensureToken: starting new login flow')
    this.loginPromise = (async () => {
      try {
        const baseUrl = this.getBaseUrl()
        const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl)
        const fallbackBaseUrl = this.getFallbackBaseUrl(baseUrl)
        console.log('[http] login flow:', { baseUrl, isLocal, path: isLocal ? '/auth/dev-login' : '/auth/wx-login' })

        let code = ''
        if (!isLocal) {
          try {
            const loginRes = await new Promise((resolve, reject) => {
              wx.login({ success: resolve, fail: reject })
            })
            code = loginRes.code || ''
          } catch (e) {
            console.error('wx.login 失败', e)
          }
        }

        const path = isLocal ? '/auth/dev-login' : '/auth/wx-login'
        const payload = isLocal ? {} : { code }

        const doLogin = (urlBase) => new Promise((resolve, reject) => {
          wx.request({
            url: `${urlBase}${path}`,
            method: 'POST',
            data: payload,
            header: { 'Content-Type': 'application/json' },
            success: (res) => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(res.data)
              } else {
                reject(new Error(`login ${res.statusCode}`))
              }
            },
            fail: (err) => reject(new Error(err.errMsg || 'login network failed'))
          })
        })

        let data
        try {
          data = await doLogin(baseUrl)
        } catch (err) {
          console.warn('[http] login primary failed:', err?.message, 'try fallback:', fallbackBaseUrl)
          if (fallbackBaseUrl) {
            data = await doLogin(fallbackBaseUrl)
          } else {
            throw err
          }
        }

        const accessToken = data?.accessToken || data?.token || ''
        console.log('[http] login response:', { hasToken: !!accessToken, userId: data?.user?.id })
        if (!accessToken) throw new Error('login 响应缺少 accessToken')

        wx.setStorageSync('token', accessToken)
        if (data?.refreshToken) wx.setStorageSync('refreshToken', data.refreshToken)
        userStore.setToken && userStore.setToken(accessToken)
        userStore.setUserInfo && userStore.setUserInfo({ id: data?.user?.id || '' })
        try {
          const app = getApp()
          if (app?.globalData) {
            app.globalData.token = accessToken
            app.globalData.isLoggedIn = true
          }
        } catch (e) {}
        console.log('[http] 自动登录成功, userId:', data?.user?.id)
        return accessToken
      } finally {
        // 无论成败都释放锁，下次失败可以重试
        setTimeout(() => { this.loginPromise = null }, 500)
      }
    })()
    return this.loginPromise
  }

  /**
   * 显式登录：清掉"禁止自动登录"标记 + 旧 loginPromise，强制重新跑一次 ensureToken
   * 由"我的"页或登录引导按钮调用
   * 成功返回 accessToken；失败抛错（onLogin 应捕获并提示用户）
   */
  async login() {
    console.log('[http] login() invoked')
    wx.removeStorageSync('disableAutoLogin')
    // 关键：清掉可能残留的、resolve 自旧 token 的 loginPromise
    this.loginPromise = null
    const token = await this.ensureToken()
    console.log('[http] login() got token, len=', (token || '').length)
    if (!token) throw new Error('登录未拿到 accessToken')
    return token
  }

  /**
   * 显式登出：设置标记，清掉本地 token/user 状态 + 任何 in-flight loginPromise
   * 不做页面跳转，由调用方负责 UI 刷新
   */
  logout() {
    console.log('[http] logout() invoked')
    try {
      wx.setStorageSync('disableAutoLogin', '1')
      wx.removeStorageSync('token')
      wx.removeStorageSync('accessToken')
      wx.removeStorageSync('refreshToken')
      wx.removeStorageSync('activeCrawlJobId')
      wx.removeStorageSync('userSelectionDepartments')
      userStore.logout && userStore.logout()
      // 关键：丢弃任何可能存在的、resolve 自旧 token 的 loginPromise
      this.loginPromise = null
      const app = getApp()
      if (app?.globalData) {
        app.globalData.token = ''
        app.globalData.isLoggedIn = false
        app.globalData.userInfo = null
      }
    } catch (e) {}
  }

  getBaseUrl() {
    const app = getApp()
    const configured = app?.globalData?.apiBaseUrl
    if (configured) {
      return configured
    }
    // 兜底：localStorage 中已存的
    const saved = wx.getStorageSync('apiBaseUrl')
    if (saved) return saved
    // 默认生产域名
    return 'https://baoyanwang-helper.cn/api/v1'
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

    // 跳过登录端点本身，避免循环
    const isAuthEndpoint = url.startsWith('/auth/')

    try {
      // 如果没 token 且不是 auth 端点，先尝试自动登录
      if (!userStore.token && !isAuthEndpoint) {
        try {
          await this.ensureToken()
        } catch (e) {
          console.warn('[http] ensureToken 失败，继续无 token 请求', e?.message)
        }
      }
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
            if (res.statusCode >= 200 && res.statusCode < 300) {
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
                  if (fallbackRes.statusCode >= 200 && fallbackRes.statusCode < 300) {
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
              // 401：清掉旧 token，标记需要重试
              reject({ _retry401: true, message: '登录已过期' })
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: (err) => {
            reject(new Error(err.errMsg || '网络请求失败'))
          }
        })
      })

      const hasBusinessCode = response && Object.prototype.hasOwnProperty.call(response, 'code')
      if (hasBusinessCode) {
        if (response.code !== 0) {
          throw new Error(response.message || '请求失败')
        }
        return response.data
      }

      // 兼容标准REST响应（无 code/data 包裹）
      return response
    } catch (error) {
      // 401 且非登录端点：自动重新登录后重试一次
      if (error?._retry401 && !isAuthEndpoint && !config._retried) {
        try {
          userStore.logout && userStore.logout()
          wx.removeStorageSync('token')
          await this.ensureToken()
          if (showLoading) this.hideLoadingSafely()
          this.requestQueue.delete(requestKey)
          return this.request({ ...config, _retried: true })
        } catch (retryErr) {
          if (showError) {
            wx.showToast({ title: '登录失败', icon: 'none', duration: 2000 })
          }
          throw retryErr
        }
      }
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
    wx.switchTab({ url: '/pages/index/index' })
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
