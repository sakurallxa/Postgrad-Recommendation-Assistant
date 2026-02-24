import { observable, action, computed, runInAction } from 'mobx-miniprogram'

class ReminderStore {
  constructor() {}

  @observable
  reminderList = []

  @observable
  loading = false

  @computed
  get pendingReminders() {
    return this.reminderList.filter(reminder => reminder.status === 'pending')
  }

  @computed
  get sentReminders() {
    return this.reminderList.filter(reminder => reminder.status === 'sent')
  }

  @action
  async fetchReminderList() {
    this.loading = true
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const mockReminders = [
        {
          id: '1',
          campId: '1',
          campTitle: '清华大学计算机科学与技术系2024年优秀大学生夏令营',
          remindTime: '2024-03-15T09:00:00',
          status: 'pending',
          deadline: '2024-03-18'
        },
        {
          id: '2',
          campId: '2',
          campTitle: '北京大学软件与微电子学院2024年保研夏令营',
          remindTime: '2024-03-20T09:00:00',
          status: 'pending',
          deadline: '2024-03-22'
        }
      ]

      runInAction(() => {
        this.reminderList = mockReminders
      })
      return mockReminders
    } catch (error) {
      console.error('获取提醒列表失败:', error)
      throw error
    } finally {
      runInAction(() => {
        this.loading = false
      })
    }
  }

  @action
  async createReminder(campId, remindTime) {
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      
      const newReminder = {
        id: Date.now().toString(),
        campId,
        campTitle: '夏令营活动',
        remindTime,
        status: 'pending',
        deadline: '2024-03-18'
      }

      runInAction(() => {
        this.reminderList.unshift(newReminder)
      })
      return newReminder
    } catch (error) {
      console.error('创建提醒失败:', error)
      throw error
    }
  }

  @action
  async deleteReminder(reminderId) {
    try {
      await new Promise(resolve => setTimeout(resolve, 300))

      runInAction(() => {
        this.reminderList = this.reminderList.filter(item => item.id !== reminderId)
      })
    } catch (error) {
      console.error('删除提醒失败:', error)
      throw error
    }
  }

  @action
  reset() {
    this.reminderList = []
  }
}

export const reminderStore = new ReminderStore()
