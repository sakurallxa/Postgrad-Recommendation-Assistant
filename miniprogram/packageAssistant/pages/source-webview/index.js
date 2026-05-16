/**
 * 在小程序内通过 <web-view> 内嵌打开公告原文。
 *
 * 微信平台限制：
 *   - <web-view> 加载的 H5 域名必须在 "mp.weixin.qq.com → 设置 → 业务域名" 白名单内
 *   - 每个域名需要把验证 .txt 文件上传到该域名根目录（我们不掌控 985 大学域名 → 无法全部白名单）
 *   - 未白名单的域名在 web-view 加载时会触发 binderror，本页用 fallback 视图兜底
 */
Page({
  data: {
    url: '',
    originDomain: '',
    hasError: false
  },

  onLoad(query) {
    const raw = decodeURIComponent(query?.url || '')
    if (!raw) {
      wx.showToast({ title: '缺少 URL', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    // 简单解析 hostname
    let host = ''
    try {
      const m = raw.match(/^https?:\/\/([^/]+)/i)
      host = m ? m[1] : ''
    } catch (e) {}
    this.setData({ url: raw, originDomain: host })
  },

  // web-view 加载成功（bindload）
  onWebViewLoad() {
    console.log('[source-webview] web-view loaded')
  },

  // web-view 加载失败（binderror）→ 切到 fallback 视图（提示 + 复制链接）
  onWebViewError(e) {
    console.warn('[source-webview] web-view error:', e?.detail)
    this.setData({ hasError: true })
  },

  // 接收来自 H5 的 postMessage（小程序里只在 navigateBack/分享时触发）
  onWebViewMessage(e) {
    console.log('[source-webview] message from H5:', e?.detail)
  },

  onCopy() {
    wx.setClipboardData({
      data: this.data.url,
      success: () => wx.showToast({ title: '链接已复制，可粘贴到浏览器打开', icon: 'none', duration: 2000 })
    })
  }
})
