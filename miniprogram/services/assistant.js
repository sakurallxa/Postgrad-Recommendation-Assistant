import { http } from './http'

/**
 * v0.2 AI 助理相关 API
 */
class AssistantService {
  /**
   * 提交公告 URL，AI 分析后返回匹配结果
   * @param {string} url
   * @param {string} [hintTitle]
   */
  async submitUrl(url, hintTitle) {
    return http.post('/assistant/submit-url', { url, hintTitle })
  }

  /**
   * 获取"今日新机会"列表
   * @param {Object} [params]
   * @param {string} [params.action] - undecided / interested / applied / skipped / hidden
   * @param {number} [params.limit]
   */
  async getOpportunities(params = {}) {
    return http.get('/assistant/opportunities', params)
  }

  /** 匹配详情 */
  async getMatchDetail(id) {
    return http.get(`/assistant/match/${id}`)
  }

  /** 更新用户决策 */
  async updateAction(id, action) {
    return http.patch(`/assistant/match/${id}/action`, { action })
  }
}

export const assistantService = new AssistantService()
