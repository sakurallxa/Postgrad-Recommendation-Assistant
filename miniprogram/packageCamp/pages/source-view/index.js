Page({
  data: {
    url: '',
    title: '官网原文'
  },

  onLoad(options = {}) {
    const url = this.safeDecode(options.url || '')
    const title = this.safeDecode(options.title || '') || '官网原文'
    if (!url) {
      wx.showToast({
        title: '原文链接缺失',
        icon: 'none'
      })
      return
    }

    wx.setNavigationBarTitle({
      title: title.length > 10 ? '官网原文' : title
    })

    this.setData({
      url,
      title
    })
  },

  safeDecode(value) {
    if (!value || typeof value !== 'string') {
      return ''
    }
    try {
      return decodeURIComponent(value)
    } catch (error) {
      return value
    }
  },

  handleCopyLink() {
    const { url } = this.data
    if (!url) {
      return
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '已复制原文链接',
          icon: 'none'
        })
      },
      fail: () => {
        wx.showToast({
          title: '复制失败，请稍后重试',
          icon: 'none'
        })
      }
    })
  }
})
