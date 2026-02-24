import { http } from './http'

export const reminderService = {
  async createReminder(params) {
    return http.post('/reminders', params)
  },

  async deleteReminder(reminderId) {
    return http.delete(`/reminders/${reminderId}`)
  },

  async getReminderList(params) {
    return http.get('/reminders', params)
  },

  async subscribeMessage(templateId) {
    return http.post('/reminders/subscribe', { templateId })
  }
}