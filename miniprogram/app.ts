// app.ts
import { getThemeMode, resolveTheme } from './utils/settings'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 预解析一次生效主题，页面 attached 时直接复用同一套判定逻辑
    const theme = resolveTheme(getThemeMode())
    this.globalData.theme = theme
    // 监听微信客户端深浅色切换（system 模式下生效）
    if (wx.onThemeChange) {
      wx.onThemeChange((res) => {
        this.globalData.theme = res.theme === 'dark' ? 'dark' : 'light'
      })
    }
  },
})
