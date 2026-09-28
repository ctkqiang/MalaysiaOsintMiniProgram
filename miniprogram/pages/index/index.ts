// 首页：今日鉴徽记 + 反诈查询（Semak Mule）+ BNM 警示列表 + 最近查询 + 免责声明门
import { bnmAlerts, semakMule } from '../../utils/api'
import { addHistory, listHistory } from '../../utils/history'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme, isDisclaimerAccepted, acceptDisclaimer } from '../../utils/settings'
import { HistoryEntry, RiskLevel, SemakMuleResult } from '../../utils/models'
import * as haptic from '../../utils/haptic'

const S = [
  'app_name', 'app_slogan', 'home_title', 'home_semak_ph', 'home_semak_btn',
  'home_bnm_title', 'home_bnm_empty', 'home_bnm_failed', 'home_bnm_retry',
  'home_history_title', 'home_history_empty',
  'home_risk_clean', 'home_risk_hit', 'home_risk_unknown', 'home_risk_unknown_hint',
  'id_title', 'co_title', 'tab_social', 'tab_court',
  'common_clear_history', 'common_disclaimer',
]

const RISK_TEXT: Record<RiskLevel, string> = {
  clean: 'home_risk_clean',
  hit: 'home_risk_hit',
  unknown: 'home_risk_unknown',
}

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    query: '',
    loading: false,
    // 反诈结果
    result: null as null | { risk: RiskLevel; count: number; rows: string[][] },
    // BNM 列表
    bnm: [] as Array<{ name: string; website: string; date: string }>,
    bnmLoaded: false,
    bnmFailed: false,
    bnmError: '',
    // 历史
    history: [] as Array<HistoryEntry & { riskText: string }>,
    // 免责声明
    showDisclaimer: false,
  },

  lifetimes: {
    attached() {
      this.refreshChrome()
      if (!isDisclaimerAccepted()) {
        this.setData({ showDisclaimer: true })
      }
      this.loadHistory()
      this.loadBnm()
    },
  },

  pageLifetimes: {
    show() {
      this.refreshChrome()
      this.loadHistory()
    },
  },

  methods: {
    refreshChrome() {
      const lang = getLang()
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        s: stringsFor(lang, S),
      })
    },

    loadHistory() {
      const lang = getLang()
      const list = listHistory(8).map((h) => ({
        ...h,
        riskText: stringsFor(lang, [RISK_TEXT[h.risk]])[RISK_TEXT[h.risk]],
      }))
      this.setData({ history: list })
    },

    async loadBnm() {
      const res = await bnmAlerts(1)
      if (res.state === 'ok' && res.data && res.data.entries && res.data.entries.length > 0) {
        this.setData({
          bnm: res.data.entries.slice(0, 20),
          bnmLoaded: true,
          bnmFailed: false,
          bnmError: '',
        })
      } else {
        // 区分三类失败：请求被拦截/超时（有 message）、拿到页面但解析为 0 行
        const reason = res.state === 'ok' ? 'parsed_0_rows' : res.message || 'unknown'
        console.warn('[bnm] load failed:', reason)
        this.setData({
          bnm: [],
          bnmLoaded: true,
          bnmFailed: true,
          bnmError: reason,
        })
      }
    },

    onQueryInput(e: WechatMiniprogram.Input) {
      this.setData({ query: e.detail.value })
    },

    async onSearch() {
      haptic.tap()
      const q = (this.data.query || '').trim()
      if (!q) {
        wx.showToast({ title: this.data.s.home_semak_ph, icon: 'none' })
        return
      }
      this.setData({ loading: true })
      const res = await semakMule(q)
      if (res.state === 'error' || !res.data) {
        // 请求失败 ≠ 无风险：结论置为"无法判定"，避免残留上一次的旧结论
        this.setData({
          loading: false,
          result: { risk: 'unknown', count: 0, rows: [] },
        })
        addHistory('semak', q, 'unknown')
        this.loadHistory()
        wx.showToast({ title: this.data.s.home_risk_unknown, icon: 'none' })
        return
      }
      const d = res.data as SemakMuleResult
      // 命中判定只看实际返回的行数（api 层已剔除服务端虚高的 count）。
      // 有行=确证命中；无行≠清白：CCIS 实时明细需有效验证码，空返回无法区分
      // "查无记录"与"数据源未放行"，一律判为"无法判定"，不给虚假安心。
      const count = (d.rows || []).length
      const risk: RiskLevel = count > 0 ? 'hit' : 'unknown'
      haptic.risk(risk)
      this.setData({
        loading: false,
        result: { risk, count, rows: (d.rows || []).slice(0, 10) },
      })
      addHistory('semak', q, risk)
      this.loadHistory()
    },

    onClearHistory() {
      haptic.tap()
      wx.showModal({
        title: this.data.s.common_clear_history,
        success: (r) => {
          if (r.confirm) {
            haptic.warn()
            wx.setStorageSync('search_history', [])
            this.loadHistory()
          }
        },
      })
    },

    onAcceptDisclaimer() {
      haptic.success()
      acceptDisclaimer()
      this.setData({ showDisclaimer: false })
    },

    onCopy(e: WechatMiniprogram.TouchEvent) {
      const text = e.currentTarget.dataset.text as string
      wx.setClipboardData({
        data: text,
        success: () => haptic.success(),
      })
    },

    goIdentity() {
      haptic.tap()
      wx.reLaunch({ url: '/pages/identity/identity' })
    },

    goCompany() {
      haptic.tap()
      wx.reLaunch({ url: '/pages/company/company' })
    },

    goSocial() {
      haptic.tap()
      wx.reLaunch({ url: '/pages/social/social' })
    },

    goCourt() {
      haptic.tap()
      wx.reLaunch({ url: '/pages/court/court' })
    },
  },
})
