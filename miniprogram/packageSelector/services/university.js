import { http } from '../../services/http'

export const universityService = {
  async getUniversityList(params) {
    try {
      // 模拟API请求
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 模拟返回数据
      return {
        list: [
          {
            id: '1',
            name: '清华大学',
            shortName: '清华',
            logo: '',
            region: '华北',
            province: '北京',
            level: '985'
          },
          {
            id: '2',
            name: '北京大学',
            shortName: '北大',
            logo: '',
            region: '华北',
            province: '北京',
            level: '985'
          },
          {
            id: '3',
            name: '复旦大学',
            shortName: '复旦',
            logo: '',
            region: '华东',
            province: '上海',
            level: '985'
          }
        ],
        total: 3,
        page: 1,
        pageSize: 20
      }
    } catch (error) {
      console.error('获取院校列表失败:', error)
      throw error
    }
  },

  async getUniversityDetail(id) {
    return http.get(`/universities/${id}`)
  },

  async getMajorsByUniversity(universityId) {
    try {
      // 模拟API请求
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 模拟返回数据
      return [
        {
          id: '1',
          name: '计算机科学与技术',
          code: '080901',
          category: '工学',
          degreeLevel: 'master',
          universityId
        },
        {
          id: '2',
          name: '软件工程',
          code: '080902',
          category: '工学',
          degreeLevel: 'master',
          universityId
        }
      ]
    } catch (error) {
      console.error('获取专业列表失败:', error)
      throw error
    }
  }
}
