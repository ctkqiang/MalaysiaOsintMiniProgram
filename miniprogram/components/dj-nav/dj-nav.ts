// 顶栏：状态栏占位 + 题字式标题 + 右侧印章式设置入口
import { getThemeMode, resolveTheme } from '../../utils/settings'

Component({
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    settings: { type: Boolean, value: true },
  },
  options: {
    multipleSlots: true,
  },
  data: {
    themeClass: 'th-light',
    statusBarHeight: 20,
  },
  lifetimes: {
    attached() {
      this._syncTheme()
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ statusBarHeight: info.statusBarHeight || 20 })
    },
  },
  pageLifetimes: {
    show() {
      this._syncTheme()
    },
  },
  methods: {
    _syncTheme() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
      })
    },
    onBack() {
      wx.navigateBack({ delta: 1 })
    },
    onSettings() {
      wx.navigateTo({ url: '/pages/settings/settings' })
    },
  },
})
