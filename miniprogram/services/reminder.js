import { http } from './http'

/**
 * 提醒相关API服务
 * 所有请求自动携带JWT Token
 */
class ReminderService {
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
    
    return http.get('/reminders', queryParams)
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
    return http.post('/reminders', data)
  }

  /**
   * 删除提醒
   * @param {string} id - 提醒ID
   * @returns {Promise} 删除结果
   */
  async deleteReminder(id) {
    return http.delete(`/reminders/${id}`)
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
}

export const reminderService = new ReminderService()
