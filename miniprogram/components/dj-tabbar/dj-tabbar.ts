// 底部导航：首页 / 身份 / 企业（自绘，切换用 reLaunch 保持栈干净）
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme } from '../../utils/settings'

const PAGES = [
  { key: 'tab_home', path: '/pages/index/index' },
  { key: 'tab_identity', path: '/pages/identity/identity' },
  { key: 'tab_company', path: '/pages/company/company' },
  { key: 'tab_social', path: '/pages/social/social' },
  { key: 'tab_court', path: '/pages/court/court' },
]

Component({
  properties: {
    current: { type: String, value: 'tab_home' },
  },
  data: {
    themeClass: 'th-light',
    items: [] as Array<{ key: string; path: string; label: string }>,
  },
  lifetimes: {
    attached() {
      const lang = getLang()
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        items: PAGES.map((p) => ({ ...p, label: stringsFor(lang, [p.key])[p.key] })),
      })
    },
  },
  pageLifetimes: {
    show() {
      // 页面可能刚改过语言/主题，回到前台时刷新
      const lang = getLang()
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        items: PAGES.map((p) => ({ ...p, label: stringsFor(lang, [p.key])[p.key] })),
      })
    },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const path = e.currentTarget.dataset.path as string
      const current = this.data.items.find((p) => path === p.path)
      const here = PAGES.find((p) => p.key === this.data.current)
      if (current && here && current.path === here.path) {
        return
      }
      wx.reLaunch({ url: path })
    },
  },
})
