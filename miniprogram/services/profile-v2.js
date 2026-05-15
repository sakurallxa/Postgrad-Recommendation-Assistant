import { http } from './http'

/**
 * v0.2 用户档案 API
 * 区别于旧版的 profile，新版聚焦于"AI 匹配所需的结构化档案"
 */
class ProfileV2Service {
  async get() {
    return http.get('/profile')
  }

  /**
   * 更新档案（部分更新）
   * @param {Object} profile
   */
  async update(profile) {
    return http.put('/profile', profile)
  }
}

export const profileV2Service = new ProfileV2Service()
