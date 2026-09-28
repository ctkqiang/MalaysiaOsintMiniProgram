// 水墨加载：墨滴入水，三滴错相扩散
import { getThemeMode, resolveTheme } from '../../utils/settings'

Component({
  properties: {
    show: { type: Boolean, value: false },
    text: { type: String, value: '' },
  },
  data: {
    themeClass: 'th-light',
  },
  lifetimes: {
    attached() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
      })
    },
  },
})
