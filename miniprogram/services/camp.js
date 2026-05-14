import { http } from './http'

/**
 * 夏令营相关API服务
 * 所有请求自动携带JWT Token
 */
class CampService {
  /**
   * 获取夏令营列表
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码，默认1
   * @param {number} params.limit - 每页数量，默认20
   * @param {string} params.universityId - 院校ID筛选
   * @param {string|string[]} params.universityIds - 院校ID列表筛选
   * @param {string} params.majorId - 专业ID筛选
   * @param {string} params.status - 状态筛选(all/published/expired/draft)
   * @param {number|string} params.year - 年份筛选
   * @param {string} params.keyword - 关键词搜索
   * @returns {Promise} 夏令营列表数据
   */
  async getCamps(params = {}, config = {}) {
    const {
      page = 1,
      limit = 20,
      universityId,
      universityIds,
      majorId,
      status,
      year,
      keyword
    } = params
    const queryParams = { page, limit }
    
    if (universityId) queryParams.universityId = universityId
    if (universityIds && universityIds.length > 0) queryParams.universityIds = universityIds
    if (majorId) queryParams.majorId = majorId
    if (status && status !== 'all') queryParams.status = status
    if (year && year !== 'all') queryParams.year = year
    if (keyword) queryParams.keyword = keyword
    
    return http.get('/camps', queryParams, config)
  }

  /**
   * 获取夏令营详情
   * @param {string} id - 夏令营ID
   * @returns {Promise} 夏令营详情
   */
  async getCampDetail(id, config = {}) {
    return http.get(`/camps/${id}`, null, config)
  }

  /**
   * 收藏夏令营
   * @param {string} id - 夏令营ID
   * @returns {Promise} 收藏结果
   */
  async favoriteCamp(id) {
    return http.post(`/camps/${id}/favorite`)
  }

  /**
   * 取消收藏夏令营
   * @param {string} id - 夏令营ID
   * @returns {Promise} 取消收藏结果
   */
  async unfavoriteCamp(id) {
    return http.delete(`/camps/${id}/favorite`)
  }

  /**
   * 获取收藏的夏令营列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 收藏的夏令营列表
   */
  async getFavoriteCamps(params = {}) {
    const { page = 1, limit = 20 } = params
    return http.get('/camps/favorites', { page, limit })
  }

  /**
   * 提交公告字段错误反馈（β场景核心：用户纠错通道）
   * @param {string} campId - 公告ID
   * @param {Object} payload
   * @param {string} payload.issueType - deadline_wrong|materials_missing|requirements_wrong|link_dead|content_wrong|off_topic|other
   * @param {string} [payload.description] - 用户补充说明
   * @returns {Promise} 提交结果
   */
  async submitFeedback(campId, payload) {
    return http.post(`/camps/${campId}/feedback`, payload)
  }
}

export const campService = new CampService()
