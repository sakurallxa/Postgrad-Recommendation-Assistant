import { http } from './http'

class ProgressService {
  withNo404Fallback(config = {}) {
    return {
      allow404Fallback: false,
      ...config
    }
  }

  async getProgressList(params = {}, config = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress', queryParams, this.withNo404Fallback(config))
  }

  async createProgress(data, config = {}) {
    return http.post('/progress', data, this.withNo404Fallback(config))
  }

  async unfollowCamp(campId, config = {}) {
    return http.delete(`/progress/camp/${campId}/follow`, this.withNo404Fallback(config))
  }

  async getProgressDetail(progressId, config = {}) {
    return http.get(`/progress/${progressId}`, null, this.withNo404Fallback(config))
  }

  async removeProgress(progressId, config = {}) {
    return http.delete(`/progress/${progressId}`, this.withNo404Fallback(config))
  }

  async updateProgressStatus(progressId, data, config = {}) {
    return http.patch(`/progress/${progressId}/status`, data, this.withNo404Fallback(config))
  }

  async confirmProgressStep(progressId, data, config = {}) {
    return http.post(`/progress/${progressId}/confirm-step`, data, this.withNo404Fallback(config))
  }

  async getSubscription(progressId, config = {}) {
    return http.get(`/progress/${progressId}/subscription`, null, this.withNo404Fallback(config))
  }

  async updateSubscription(progressId, data, config = {}) {
    return http.patch(`/progress/${progressId}/subscription`, data, this.withNo404Fallback(config))
  }

  async getSchoolSubscriptions(config = {}) {
    return http.get('/progress/school-subscriptions', null, this.withNo404Fallback(config))
  }

  async updateSchoolSubscription(universityId, data, config = {}) {
    return http.patch(
      `/progress/school-subscriptions/${universityId}`,
      data,
      this.withNo404Fallback(config)
    )
  }

  async getAlerts(params = {}, config = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress/alerts', queryParams, this.withNo404Fallback(config))
  }

  async handleAlert(alertId, config = {}) {
    return http.patch(`/progress/alerts/${alertId}/handle`, {}, this.withNo404Fallback(config))
  }

  async snoozeAlert(alertId, data = { hours: 24 }, config = {}) {
    return http.patch(`/progress/alerts/${alertId}/snooze`, data, this.withNo404Fallback(config))
  }

  async consumeActionToken(data, config = {}) {
    return http.post('/progress/actions/consume', data, this.withNo404Fallback(config))
  }
}

export const progressService = new ProgressService()
