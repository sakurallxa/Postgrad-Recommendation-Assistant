/**
 * 微信订阅消息（一次性订阅）辅助
 *
 * 产品能力说明：
 * - 微信小程序「订阅消息」分一次性订阅（普通模板）和长期订阅（特定行业）。
 *   保研场景属于通用提醒，使用「一次性订阅」。
 * - 一次性订阅必须由用户在小程序内点击触发 wx.requestSubscribeMessage，弹窗确认后
 *   每授权一次 = 后端可向该 openid 推送 1 条消息（quota = 1）。
 * - 同一个 tmplId 可以在一次 requestSubscribeMessage 调用里写多次（最多 3 条），
 *   用户每勾选一次"总是保持以上选择"或单次点击"允许"= 累计 1 个 quota。
 *
 * 我们的策略：
 *   收藏一条公告 → 一次 requestSubscribeMessage 申请 3 个 quota（[tplId, tplId, tplId]）。
 *   只要用户点了"允许"，后端拿到 3 次推送权 → cron 在截止前 7/5/3 天各推一条。
 *   如果只授权 1/2 个，后端发送时多余的会失败（WeChat API 静默丢弃），但不影响主流程。
 */

const DEFAULT_TEMPLATE_ID = 'aRCHQUJIlT5Z0yWhzAqs7Ab3MWbKZqLtxEoHqXKB3bs'

function resolveTemplateId() {
  try {
    const app = getApp()
    const fromGlobal = app?.globalData?.wxSubscribeTemplateId
    const fromStorage = wx.getStorageSync('wxSubscribeTemplateId')
    const candidate = fromGlobal || fromStorage || DEFAULT_TEMPLATE_ID
    if (!candidate || candidate === '你的模板ID') return ''
    return candidate
  } catch (e) {
    return DEFAULT_TEMPLATE_ID
  }
}

/**
 * 申请 ddl 提醒订阅 quota（最多 3 个，对应 7/5/3 天前的 3 次推送）
 * @returns {Promise<{
 *   accepted: number,        // 拿到的 quota 数（用户允许时 = total，否则 0）
 *   total: number,           // 申请的 quota 总数
 *   templateId: string,
 *   userRejected: boolean,   // 用户明确点了"取消"（区别于平台错误 / 没弹窗）
 *   shown: boolean           // 是否成功弹出过授权弹窗
 * }>}
 */
function requestDeadlineQuota() {
  const tplId = resolveTemplateId()
  if (!tplId) {
    console.warn('[subscribe-message] 未配置模板 ID，跳过 wx.requestSubscribeMessage')
    return Promise.resolve({ accepted: 0, total: 0, templateId: '', userRejected: false, shown: false })
  }
  const tmplIds = [tplId, tplId, tplId]
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        // res[tplId] = 'accept' | 'reject' | 'ban'（用户禁用了订阅消息总开关）
        const status = res?.[tplId]
        const accepted = status === 'accept' ? tmplIds.length : 0
        const userRejected = status === 'reject' || status === 'ban'
        console.log('[subscribe-message] result:', res, 'userRejected=', userRejected)
        resolve({ accepted, total: tmplIds.length, templateId: tplId, userRejected, shown: true })
      },
      fail: (err) => {
        // fail 一般是平台错误：用户没机会选 → 不算 rejected
        console.warn('[subscribe-message] failed:', err?.errMsg)
        resolve({ accepted: 0, total: tmplIds.length, templateId: tplId, userRejected: false, shown: false })
      }
    })
  })
}

export { requestDeadlineQuota, resolveTemplateId }
export default { requestDeadlineQuota, resolveTemplateId }
