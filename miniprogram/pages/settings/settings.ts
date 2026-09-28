// 设置：主题（宣纸/夜墨/随系统）、语言（中/英/马来）、推送订阅、免责声明重置、后端接入状态、关于
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme, setLang, setThemeMode } from '../../utils/settings'
import { backendReady, BASE_URL } from '../../utils/api'
import { disablePush, enablePush, getPushPref, pushTemplateReady } from '../../utils/push'
import { Lang, ThemeMode } from '../../utils/models'

const S = [
  'app_name', 'app_slogan', 'common_disclaimer', 'common_direct_hint',
  'set_title', 'set_theme', 'set_theme_light', 'set_theme_dark', 'set_theme_system',
  'set_lang', 'set_backend', 'set_backend_on', 'set_backend_off', 'set_backend_direct',
  'set_push', 'set_push_desc', 'set_push_on', 'set_push_off', 'set_push_pending',
  'set_push_reject', 'set_push_applied', 'set_push_closed',
  'set_reset_gate', 'set_reset_done', 'set_version',
]

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    themeMode: 'light' as ThemeMode,
    lang: 'zh' as Lang,
    backendOn: false,
    backendUrl: '',
    pushOn: false,
    pushReady: false,
    pushLast: 'none',
  },

  lifetimes: {
    attached() {
      this.refresh()
    },
  },

  pageLifetimes: {
    show() {
      this.refresh()
    },
  },

  methods: {
    refresh() {
      const p = getPushPref()
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        s: stringsFor(getLang(), S),
        themeMode: getThemeMode(),
        lang: getLang(),
        backendOn: backendReady(),
        backendUrl: BASE_URL || '—',
        pushOn: p.on,
        pushReady: pushTemplateReady(),
        pushLast: p.last,
      })
    },

    onTheme(e: WechatMiniprogram.TouchEvent) {
      const mode = e.currentTarget.dataset.mode as ThemeMode
      setThemeMode(mode)
      // 写回全局，其它页面 pageLifetimes.show 时自动同步
      const app = getApp<IAppOption>()
      app.globalData.theme = resolveTheme(mode)
      this.refresh()
    },

    onLang(e: WechatMiniprogram.TouchEvent) {
      const lang = e.currentTarget.dataset.lang as Lang
      setLang(lang)
      this.refresh()
      // 语言切换结果用新语言的应用名提示，一次切换后全局生效
      wx.showToast({ title: stringsFor(lang, ['app_name']).app_name, icon: 'none' })
    },

    /** 微信要求订阅弹窗必须在用户手势的同步调用链中触发 */
    async onPushToggle() {
      if (this.data.pushOn) {
        disablePush()
        this.refresh()
        wx.showToast({ title: this.data.s.set_push_closed, icon: 'none' })
        return
      }
      const p = await enablePush()
      this.refresh()
      let msg = this.data.s.set_push_pending
      if (!pushTemplateReady()) {
        msg = this.data.s.set_push_pending
      } else if (p.last === 'ok') {
        msg = this.data.s.set_push_applied
      } else if (p.last === 'reject') {
        msg = this.data.s.set_push_reject
      }
      wx.showToast({ title: msg, icon: 'none' })
    },

    onResetGate() {
      // 清掉确认标记，回到首页时免责声明门会重新弹出
      wx.removeStorageSync('settings.disclaimer_ok')
      wx.showToast({ title: this.data.s.set_reset_done, icon: 'none' })
    },
  },
})
