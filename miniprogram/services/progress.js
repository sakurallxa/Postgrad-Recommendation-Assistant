import { http } from './http'

class ProgressService {
  async getProgressList(params = {}, config = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress', queryParams, config)
  }

  async createProgress(data, config = {}) {
    return http.post('/progress', data, config)
  }

  async getProgressDetail(progressId, config = {}) {
    return http.get(`/progress/${progressId}`, null, config)
  }

  async updateProgressStatus(progressId, data, config = {}) {
    return http.patch(`/progress/${progressId}/status`, data, config)
  }

  async getSubscription(progressId, config = {}) {
    return http.get(`/progress/${progressId}/subscription`, null, config)
  }

  async updateSubscription(progressId, data, config = {}) {
    return http.patch(`/progress/${progressId}/subscription`, data, config)
  }

  async getAlerts(params = {}, config = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress/alerts', queryParams, config)
  }

  async handleAlert(alertId, config = {}) {
    return http.patch(`/progress/alerts/${alertId}/handle`, {}, config)
  }

  async snoozeAlert(alertId, data = { hours: 24 }, config = {}) {
    return http.patch(`/progress/alerts/${alertId}/snooze`, data, config)
  }
}

export const progressService = new ProgressService()
