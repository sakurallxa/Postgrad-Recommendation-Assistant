import { http } from '../../services/http'

class UserService {
  async getStudentProfile(config = {}) {
    return http.get('/user/student-profile', null, config)
  }

  async updateStudentProfile(data = {}, config = {}) {
    return http.put('/user/student-profile', data, config)
  }
}

export const userService = new UserService()
