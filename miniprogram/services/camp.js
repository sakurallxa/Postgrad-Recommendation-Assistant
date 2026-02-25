import { http } from './http'

export const campService = {
  async getCampList(params) {
    return http.get('/camps', params)
  },

  async getCampDetail(campId) {
    return http.get(`/camps/${campId}`)
  },

  async getUrgentCamps() {
    return http.get('/camps/urgent')
  },

  async getCampsByUniversity(universityId) {
    return http.get('/camps', { universityIds: universityId })
  },

  async getCampsByMajor(majorId) {
    return http.get('/camps', { majorIds: majorId })
  }
}