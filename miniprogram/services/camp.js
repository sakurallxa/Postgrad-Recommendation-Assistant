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
   * @param {string} params.majorId - 专业ID筛选
   * @param {string} params.keyword - 关键词搜索
   * @returns {Promise} 夏令营列表数据
   */
  async getCamps(params = {}) {
    const { page = 1, limit = 20, universityId, majorId, keyword } = params
    const queryParams = { page, limit }
    
    if (universityId) queryParams.universityId = universityId
    if (majorId) queryParams.majorId = majorId
    if (keyword) queryParams.keyword = keyword
    
    return http.get('/camps', queryParams)
  }

  /**
   * 获取夏令营详情
   * @param {string} id - 夏令营ID
   * @returns {Promise} 夏令营详情
   */
  async getCampDetail(id) {
    return http.get(`/camps/${id}`)
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
}

export const campService = new CampService()
