// 社交账号枚举：用户名 → 60+ 平台 HEAD 探测（直连，与原版 searchSocialMedia 一致）
import { socialEnumerate } from '../../utils/api'
import { addHistory, listHistory } from '../../utils/history'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme } from '../../utils/settings'
import { HistoryEntry, SocialHit } from '../../utils/models'
import * as haptic from '../../utils/haptic'

const S = [
  'so_title', 'so_ph', 'so_btn', 'so_result', 'so_no_hit',
  'so_count', 'so_failed', 'home_history_title',
  'common_copy', 'common_copied',
]

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    query: '',
    loading: false,
    searched: false,
    hits: [] as SocialHit[],
    recent: [] as HistoryEntry[],
    errMsg: '',
  },

  lifetimes: {
    attached() {
      this.refreshChrome()
      this.loadRecent()
    },
  },

  pageLifetimes: {
    show() {
      this.refreshChrome()
      this.loadRecent()
    },
  },

  methods: {
    refreshChrome() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        s: stringsFor(getLang(), S),
      })
    },

    loadRecent() {
      this.setData({
        recent: listHistory().filter((h) => h.type === 'social').slice(0, 8),
      })
    },

    onQueryInput(e: WechatMiniprogram.Input) {
      this.setData({ query: e.detail.value })
    },

    onPickRecent(e: WechatMiniprogram.TouchEvent) {
      haptic.tap()
      const q = e.currentTarget.dataset.q as string
      this.setData({ query: q })
      this.onSearch()
    },

    async onSearch() {
      haptic.tap()
      const q = (this.data.query || '').trim().replace(/^@/, '')
      if (!q) {
        this.setData({ errMsg: this.data.s.so_ph })
        return
      }
      this.setData({ loading: true, errMsg: '', searched: true })
      const res = await socialEnumerate(q)
      if (res.state !== 'ok' || !res.data) {
        haptic.warn()
        this.setData({
          loading: false,
          hits: [],
          errMsg: res.state === 'error' ? this.data.s.so_failed : '',
        })
        addHistory('social', q, 'unknown')
        this.loadRecent()
        return
      }
      const hits = (res.data.hits || []).map((h) => ({
        ...h,
        // 平台首字圆章文本：拉丁取首字母大写，中文取首字
        initial: socialInitial(h.platform),
      }))
      haptic.risk(hits.length > 0 ? 'hit' : 'clean')
      this.setData({ loading: false, hits })
      addHistory('social', q, hits.length > 0 ? 'hit' : 'clean')
      this.loadRecent()
    },

    onCopy(e: WechatMiniprogram.TouchEvent) {
      const text = e.currentTarget.dataset.text as string
      wx.setClipboardData({
        data: text,
        success: () => {
          haptic.success()
          wx.showToast({ title: this.data.s.common_copied, icon: 'none' })
        },
      })
    },
  },
})

/** 平台章文本：拉丁取首字母大写，中文取首字 */
function socialInitial(name: string): string {
  const ch = (name || '?').charAt(0)
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
}
