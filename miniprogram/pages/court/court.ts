// 电子法庭：关键词检索判决书（直连 e-Court），结果界格列表 + 文书直链复制
import { ecourtSearch, ecourtDocUrl, foldECourt } from '../../utils/api'
import { addHistory, listHistory } from '../../utils/history'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme } from '../../utils/settings'
import { ECourtResult, HistoryEntry } from '../../utils/models'

const S = [
  'ct_title', 'ct_ph', 'ct_btn', 'ct_result', 'ct_no_result', 'ct_judge',
  'ct_case_no', 'ct_dates', 'ct_parties', 'ct_pdf', 'ct_doc_hint',
  'ct_total', 'ct_matched', 'ct_page', 'ct_failed', 'ct_domain_hint',
  'ct_more', 'ct_loading',
  'home_history_title',
  'common_copy', 'common_copied',
]

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    query: '',
    loading: false,
    searched: false,
    result: null as ECourtResult | null,
    errMsg: '',
    recent: [] as HistoryEntry[],
    expandIdx: -1,
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
        recent: listHistory().filter((h) => h.type === 'court').slice(0, 8),
      })
    },

    onQueryInput(e: WechatMiniprogram.Input) {
      this.setData({ query: e.detail.value })
    },

    onPickRecent(e: WechatMiniprogram.TouchEvent) {
      const q = e.currentTarget.dataset.q as string
      this.setData({ query: q })
      this.onSearch()
    },

    async onSearch() {
      this.doSearch(1, false)
    },

    /** 下一页：结果累加展示 */
    onMorePage() {
      const r = this.data.result
      if (!r || this.data.loading || r.currPage >= r.totalPage) return
      this.doSearch(r.currPage + 1, true)
    },

    async doSearch(page: number, append: boolean) {
      const q = (this.data.query || '').trim()
      if (!q) {
        this.setData({ errMsg: this.data.s.ct_ph })
        return
      }
      this.setData({ loading: true, errMsg: '', searched: true })
      const res = await ecourtSearch(q, page)
      if (res.state !== 'ok' || !res.data) {
        // 透出具体失败原因（域名拦截 / 超时 / HTTP 码），便于真机定位
        const detail = res.message || ''
        const blocked = detail.indexOf('domain') !== -1
        this.setData({
          loading: false,
          errMsg: (blocked ? this.data.s.ct_domain_hint : this.data.s.ct_failed) + (detail ? '（' + detail + '）' : ''),
        })
        return
      }
      const folded = foldECourt(res.data)
      if (append && this.data.result) {
        const prev = this.data.result
        folded.items = prev.items.concat(folded.items)
      }
      this.setData({ loading: false, result: folded, expandIdx: -1 })
      if (!append) {
        addHistory('court', q, folded.items.length > 0 ? 'hit' : 'clean')
        this.loadRecent()
      }
    },

    /** 关键词两行截断，点击展开/收起 */
    onToggleExpand(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.i)
      this.setData({ expandIdx: this.data.expandIdx === i ? -1 : i })
    },

    onOpenDoc(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string
      const url = ecourtDocUrl(id)
      if (!url) {
        wx.showToast({ title: this.data.s.ct_no_result, icon: 'none' })
        return
      }
      // 小程序内无法直接打开政府站 PDF，复制到剪贴板引导系统浏览器查看
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: this.data.s.ct_doc_hint, icon: 'none' }),
      })
    },

    onCopy(e: WechatMiniprogram.TouchEvent) {
      const text = e.currentTarget.dataset.text as string
      wx.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: this.data.s.common_copied, icon: 'none' }),
      })
    },
  },
})
