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

  /** 触发按需点对点抓取作业（订阅保存后立即调用） */
  async createCrawlJob(departmentIds, triggerType = 'initial_selection') {
    return http.post('/crawl-jobs', { departmentIds, triggerType })
  }

  /** 查作业进度（前端 15s 轮询） */
  async getCrawlJob(jobId) {
    return http.get(`/crawl-jobs/${jobId}`)
  }

  /** 我最近的一次作业（用于首页 banner 复位） */
  async getLatestCrawlJob() {
    return http.get('/crawl-jobs/latest')
  }

  /** 作业最终结果 */
  async getCrawlJobResults(jobId) {
    return http.get(`/crawl-jobs/${jobId}/results`)
  }

  /** 提交"抓不到"反馈 */
  async submitCrawlJobFeedback(jobId, payload) {
    return http.post(`/crawl-jobs/${jobId}/feedback`, payload)
  }
}

export const subscriptionService = new SubscriptionService()
