import { http } from './http'

class SubscriptionService {
  /** 获取5校×院系结构 + 用户当前订阅状态 */
  async listSchools() {
    return http.get('/subscription/schools')
  }

  /** 基于档案 targetMajors 推荐应订阅的院系 */
  async getRecommendations() {
    return http.get('/subscription/recommendations')
  }

  /**
   * 批量订阅（覆盖式：传入的成为最新订阅）
   * @param {string[]} departmentIds
   */
  async batchSubscribe(departmentIds) {
    return http.post('/subscription/batch', { departmentIds })
  }

  /** 取消单个院系订阅 */
  async unsubscribe(departmentId) {
    return http.delete(`/subscription/${departmentId}`)
  }
}

export const subscriptionService = new SubscriptionService()
