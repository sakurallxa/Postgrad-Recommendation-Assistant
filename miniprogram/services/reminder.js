import { http } from './http'

const LOCAL_REMINDERS_KEY = 'localReminders'
const REMINDER_ENDPOINT_UNAVAILABLE_KEY = 'reminderEndpointUnavailable'

/**
 * 提醒相关API服务
 * 所有请求自动携带JWT Token
 */
class ReminderService {
  constructor() {
    this.reminderEndpointUnavailable = wx.getStorageSync(REMINDER_ENDPOINT_UNAVAILABLE_KEY) === true
  }

  /**
   * 获取提醒列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码，默认1
   * @param {number} params.limit - 每页数量，默认20
   * @param {string} params.status - 状态筛选：pending/sent/failed/expired
   * @returns {Promise} 提醒列表数据
   */
  async getReminders(params = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }

    if (!this.shouldUseRemoteReminderApi()) {
      return this.getLocalReminderPage({ page, limit, status })
    }

    try {
      return await http.get('/reminders', queryParams, {
        showError: false,
        allow404Fallback: false
      })
    } catch (error) {
      if (!this.shouldFallbackToLocal(error)) {
        throw error
      }
      this.markReminderEndpointUnavailableIfNeeded(error)
      return this.getLocalReminderPage({ page, limit, status })
    }
  }

  /**
   * 创建提醒
   * @param {Object} data - 提醒数据
   * @param {string} data.campId - 夏令营ID
   * @param {string} data.remindTime - 提醒时间
   * @param {boolean} data.wechatReminder - 是否微信提醒
   * @param {boolean} data.appReminder - 是否小程序内提醒
   * @returns {Promise} 创建的提醒数据
   */
  async createReminder(data) {
    const payload = { ...data }
    const campSnapshot = payload.campSnapshot || {}
    delete payload.campSnapshot

    if (!this.shouldUseRemoteReminderApi()) {
      return this.createLocalReminder(payload, campSnapshot)
    }

    try {
      return await http.post('/reminders', payload, {
        showLoading: false,
        showError: false,
        allow404Fallback: false,
        allow405Fallback: true
      })
    } catch (error) {
      if (!this.shouldFallbackToLocal(error)) {
        throw error
      }
      this.markReminderEndpointUnavailableIfNeeded(error)
      return this.createLocalReminder(payload, campSnapshot)
    }
  }

  /**
   * 删除提醒
   * @param {string} id - 提醒ID
   * @returns {Promise} 删除结果
   */
  async deleteReminder(id) {
    if (String(id).startsWith('local_')) {
      this.removeLocalReminderById(id)
      return { id, deleted: true, local: true }
    }

    if (!this.shouldUseRemoteReminderApi()) {
      this.removeLocalReminderById(id)
      return { id, deleted: true, local: true }
    }

    try {
      return await http.delete(`/reminders/${id}`, { showError: false })
    } catch (error) {
      if (!this.shouldFallbackToLocal(error)) {
        throw error
      }
      this.markReminderEndpointUnavailableIfNeeded(error)
      this.removeLocalReminderById(id)
      return { id, deleted: true, local: true }
    }
  }

  /**
   * 获取提醒详情
   * @param {string} id - 提醒ID
   * @returns {Promise} 提醒详情
   */
  async getReminderDetail(id) {
    return http.get(`/reminders/${id}`)
  }

  /**
   * 更新提醒
   * @param {string} id - 提醒ID
   * @param {Object} data - 更新的数据
   * @returns {Promise} 更新后的提醒数据
   */
  async updateReminder(id, data) {
    return http.put(`/reminders/${id}`, data)
  }

  shouldFallbackToLocal(error) {
    const message = error?.message || ''
    if (!message || message === '登录已过期') {
      return false
    }
    return /请求失败:\s*(404|405|5\d{2})/.test(message) || /network|timeout|超时/i.test(message)
  }

  shouldUseRemoteReminderApi() {
    const forceRemote = wx.getStorageSync('forceRemoteReminderApi')
    if (forceRemote === true) {
      return true
    }

    if (this.reminderEndpointUnavailable) {
      return false
    }

    const app = getApp()
    const baseUrl = app?.globalData?.apiBaseUrl || ''
    if (!baseUrl) {
      return false
    }
    return true
  }

  markReminderEndpointUnavailableIfNeeded(error) {
    const message = error?.message || ''
    if (/请求失败:\s*(404|405)/.test(message)) {
      this.reminderEndpointUnavailable = true
      wx.setStorageSync(REMINDER_ENDPOINT_UNAVAILABLE_KEY, true)
    }
  }

  createLocalReminder(payload, campSnapshot = {}) {
    const now = new Date().toISOString()
    const localReminder = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      campId: payload.campId,
      remindTime: payload.remindTime,
      wechatReminder: Boolean(payload.wechatReminder),
      appReminder: Boolean(payload.appReminder),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      camp: {
        title: campSnapshot.title || '未知夏令营/预推免',
        deadline: campSnapshot.deadline || '',
        university: {
          name: campSnapshot.universityName || '未知院校'
        }
      },
      __local: true
    }

    const localReminders = wx.getStorageSync(LOCAL_REMINDERS_KEY) || []
    localReminders.unshift(localReminder)
    wx.setStorageSync(LOCAL_REMINDERS_KEY, localReminders)

    return localReminder
  }

  getLocalReminderPage({ page = 1, limit = 20, status } = {}) {
    const localReminders = wx.getStorageSync(LOCAL_REMINDERS_KEY) || []
    const normalizedStatus = status && status !== 'all' ? status : ''
    const filtered = normalizedStatus
      ? localReminders.filter(item => item.status === normalizedStatus)
      : localReminders
    const safePage = Number(page) > 0 ? Number(page) : 1
    const safeLimit = Number(limit) > 0 ? Number(limit) : 20
    const start = (safePage - 1) * safeLimit
    const data = filtered.slice(start, start + safeLimit)
    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit))
      }
    }
  }

  removeLocalReminderById(id) {
    const localReminders = wx.getStorageSync(LOCAL_REMINDERS_KEY) || []
    const next = localReminders.filter(item => item.id !== id)
    wx.setStorageSync(LOCAL_REMINDERS_KEY, next)
  }
}

export const reminderService = new ReminderService()
