// 印章组件：risk = hit 朱砂方印「警」/ clean 竹青圆印「清」/ unknown 素纱方印「？」/ pending 泥金空心印「待」
import { getThemeMode, resolveTheme } from '../../utils/settings'

const GLYPHS: Record<string, string> = { hit: '警', clean: '清', unknown: '?', pending: '待' }

Component({
  properties: {
    risk: {
      type: String,
      value: 'pending', // hit | clean | unknown | pending
      observer(risk: string) {
        this.setData({ glyph: GLYPHS[risk] || '待' })
      },
    },
    size: {
      type: Number,
      value: 96, // rpx
      observer(size: number) {
        this.setData({ fontSize: Math.round(size * 0.44) })
      },
    },
    label: { type: String, value: '' }, // 覆盖默认印文
  },
  data: {
    glyph: '待',
    fontSize: 42,
    themeClass: 'th-light',
  },
  lifetimes: {
    attached() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
      })
    },
  },
  pageLifetimes: {
    show() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
      })
    },
  },
})
