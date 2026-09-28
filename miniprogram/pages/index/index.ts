// 首页：今日鉴徽记 + 反诈查询（Semak Mule）+ BNM 警示列表 + 最近查询 + 免责声明门
import { bnmAlerts, semakMule } from '../../utils/api'
import { addHistory, listHistory } from '../../utils/history'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme, isDisclaimerAccepted, acceptDisclaimer } from '../../utils/settings'
import { HistoryEntry, RiskLevel, SemakMuleResult } from '../../utils/models'

const S = [
  'app_name', 'app_slogan', 'home_title', 'home_semak_ph', 'home_semak_btn',
  'home_bnm_title', 'home_bnm_empty', 'home_bnm_failed', 'home_bnm_retry',
  'home_history_title', 'home_history_empty',
  'home_risk_clean', 'home_risk_hit', 'home_risk_unknown',
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
      if (res.state === 'ok' && res.data && res.data.entries) {
        this.setData({
          bnm: res.data.entries.slice(0, 20),
          bnmLoaded: true,
          bnmFailed: false,
        })
      } else {
        this.setData({ bnm: [], bnmLoaded: true, bnmFailed: true })
      }
    },

    onQueryInput(e: WechatMiniprogram.Input) {
      this.setData({ query: e.detail.value })
    },

    async onSearch() {
      const q = (this.data.query || '').trim()
      if (!q) {
        wx.showToast({ title: this.data.s.home_semak_ph, icon: 'none' })
        return
      }
      this.setData({ loading: true })
      const res = await semakMule(q)
      if (res.state === 'error' || !res.data) {
        this.setData({ loading: false })
        wx.showToast({ title: this.data.s.home_risk_unknown, icon: 'none' })
        return
      }
      const d = res.data as SemakMuleResult
      const count = d.count || 0
      const risk: RiskLevel = count > 0 ? 'hit' : 'clean'
      this.setData({
        loading: false,
        result: { risk, count, rows: (d.rows || []).slice(0, 10) },
      })
      addHistory('semak', q, risk)
      this.loadHistory()
    },

    onClearHistory() {
      wx.showModal({
        title: this.data.s.common_clear_history,
        success: (r) => {
          if (r.confirm) {
            wx.setStorageSync('search_history', [])
            this.loadHistory()
          }
        },
      })
    },

    onAcceptDisclaimer() {
      acceptDisclaimer()
      this.setData({ showDisclaimer: false })
    },

    onCopy(e: WechatMiniprogram.TouchEvent) {
      const text = e.currentTarget.dataset.text as string
      wx.setClipboardData({ data: text })
    },

    goIdentity() {
      wx.reLaunch({ url: '/pages/identity/identity' })
    },

    goCompany() {
      wx.reLaunch({ url: '/pages/company/company' })
    },

    goSocial() {
      wx.reLaunch({ url: '/pages/social/social' })
    },

    goCourt() {
      wx.reLaunch({ url: '/pages/court/court' })
    },
  },
})
