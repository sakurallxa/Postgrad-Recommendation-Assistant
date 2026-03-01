import { http } from './http'

class ProgressService {
  async getProgressList(params = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress', queryParams)
  }

  async createProgress(data) {
    return http.post('/progress', data)
  }

  async getProgressDetail(progressId) {
    return http.get(`/progress/${progressId}`)
  }

  async updateProgressStatus(progressId, data) {
    return http.patch(`/progress/${progressId}/status`, data)
  }

  async getSubscription(progressId) {
    return http.get(`/progress/${progressId}/subscription`)
  }

  async updateSubscription(progressId, data) {
    return http.patch(`/progress/${progressId}/subscription`, data)
  }

  async getAlerts(params = {}) {
    const { page = 1, limit = 20, status } = params
    const queryParams = { page, limit }
    if (status && status !== 'all') {
      queryParams.status = status
    }
    return http.get('/progress/alerts', queryParams)
  }

  async handleAlert(alertId) {
    return http.patch(`/progress/alerts/${alertId}/handle`, {})
  }

  async snoozeAlert(alertId, data = { hours: 24 }) {
    return http.patch(`/progress/alerts/${alertId}/snooze`, data)
  }
}

export const progressService = new ProgressService()
