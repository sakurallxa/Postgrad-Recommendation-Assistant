// 状态管理入口
import { userStore } from './user'
import { campStore } from './camp'
import { reminderStore } from './reminder'
import { selectionStore } from './selection'

const store = {
  user: userStore,
  camp: campStore,
  reminder: reminderStore,
  selection: selectionStore
}

export default store
export { store, userStore, campStore, reminderStore, selectionStore }