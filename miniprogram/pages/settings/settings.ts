// 设置：主题（宣纸/夜墨/随系统）、语言（中/英/马来）、推送订阅（三场景）、触感反馈、免责声明重置、接入状态、关于
import { stringsFor } from '../../utils/i18n'
import { getHaptics, getLang, getThemeMode, resolveTheme, setHaptics, setLang, setThemeMode } from '../../utils/settings'
import { backendReady, BASE_URL } from '../../utils/api'
import { disableScene, enablePush, getPushPref, PushScene, readyScenes, sceneTemplateId } from '../../utils/push'
import * as haptic from '../../utils/haptic'
import { Lang, ThemeMode } from '../../utils/models'

const S = [
  'app_name', 'app_slogan', 'common_disclaimer', 'common_direct_hint',
  'set_title', 'set_theme', 'set_theme_light', 'set_theme_dark', 'set_theme_system',
  'set_lang', 'set_backend', 'set_backend_on', 'set_backend_off', 'set_backend_direct',
  'set_push', 'set_push_desc', 'set_push_on', 'set_push_off', 'set_push_pending',
  'set_push_reject', 'set_push_applied', 'set_push_closed', 'set_push_all',
  'set_push_bnm', 'set_push_semak', 'set_push_court',
  'set_haptics', 'set_haptics_desc',
  'set_reset_gate', 'set_reset_done', 'set_version',
]

interface SceneRow {
  scene: PushScene
  labelKey: string
  on: boolean
  ready: boolean
}

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    themeMode: 'light' as ThemeMode,
    lang: 'zh' as Lang,
    backendOn: false,
    backendUrl: '',
    scenes: [] as SceneRow[],
    pushLast: 'none',
    pushAnyReady: false,
    hapticsOn: true,
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
      const ready = readyScenes().map((t) => t.scene)
      const scenes: SceneRow[] = (['bnm_alert', 'semak_hit', 'court_new'] as PushScene[]).map((sc) => ({
        scene: sc,
        labelKey: sc === 'bnm_alert' ? 'set_push_bnm' : sc === 'semak_hit' ? 'set_push_semak' : 'set_push_court',
        on: !!p.scenes[sc],
        ready: ready.indexOf(sc) !== -1,
      }))
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        s: stringsFor(getLang(), S),
        themeMode: getThemeMode(),
        lang: getLang(),
        backendOn: backendReady(),
        backendUrl: BASE_URL || '—',
        scenes,
        pushLast: p.last,
        pushAnyReady: ready.length > 0,
        hapticsOn: getHaptics(),
      })
    },

    onTheme(e: WechatMiniprogram.TouchEvent) {
      haptic.select()
      const mode = e.currentTarget.dataset.mode as ThemeMode
      setThemeMode(mode)
      // 写回全局，其它页面 pageLifetimes.show 时自动同步
      const app = getApp<IAppOption>()
      app.globalData.theme = resolveTheme(mode)
      this.refresh()
    },

    onLang(e: WechatMiniprogram.TouchEvent) {
      haptic.select()
      const lang = e.currentTarget.dataset.lang as Lang
      setLang(lang)
      this.refresh()
      // 语言切换结果用新语言的应用名提示，一次切换后全局生效
      wx.showToast({ title: stringsFor(lang, ['app_name']).app_name, icon: 'none' })
    },

    /** 单场景开关：开=申请该模板订阅；关=本地停订 */
    async onSceneToggle(e: WechatMiniprogram.TouchEvent) {
      const scene = e.currentTarget.dataset.scene as PushScene
      const row = this.data.scenes.filter((x) => x.scene === scene)[0]
      if (!row) return
      haptic.tap()
      if (row.on) {
        disableScene(scene)
        this.refresh()
        wx.showToast({ title: this.data.s.set_push_closed, icon: 'none' })
        return
      }
      if (!sceneTemplateId(scene)) {
        wx.showToast({ title: this.data.s.set_push_pending, icon: 'none' })
        return
      }
      const p = await enablePush([scene])
      this.refresh()
      if (p.scenes[scene]) {
        haptic.success()
        wx.showToast({ title: this.data.s.set_push_applied, icon: 'none' })
      } else {
        wx.showToast({ title: this.data.s.set_push_reject, icon: 'none' })
      }
    },

    /** 一键申请全部已配置模板（一次弹窗最多 3 条，恰好覆盖三场景） */
    async onPushAll() {
      haptic.tap()
      if (!this.data.pushAnyReady) {
        wx.showToast({ title: this.data.s.set_push_pending, icon: 'none' })
        return
      }
      const p = await enablePush()
      this.refresh()
      if (p.last === 'ok' || p.last === 'partial') {
        haptic.success()
        wx.showToast({ title: this.data.s.set_push_applied, icon: 'none' })
      } else {
        wx.showToast({ title: this.data.s.set_push_reject, icon: 'none' })
      }
    },

    onHapticsToggle() {
      const next = !getHaptics()
      setHaptics(next)
      if (next) haptic.success() // 开启时立刻震一下作为试听
      this.refresh()
    },

    onResetGate() {
      haptic.warn()
      // 清掉确认标记，回到首页时免责声明门会重新弹出
      wx.removeStorageSync('settings.disclaimer_ok')
      wx.showToast({ title: this.data.s.set_reset_done, icon: 'none' })
    },
  },
})
