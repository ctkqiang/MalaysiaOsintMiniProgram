// 身份证综合查询：MyKad 本地解析（简牍卡）+ SSPI/通缉/SPRM 三源印章（待接入后端）
import { identityCheck, IdentityRemoteResult } from '../../utils/api'
import { parseMyKad, isMyKadValid } from '../../utils/parsers'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme } from '../../utils/settings'
import { addHistory } from '../../utils/history'
import { MyKadInfo, RiskLevel, SourceStatus } from '../../utils/models'
import * as haptic from '../../utils/haptic'

const S = [
  'id_title', 'id_ph', 'id_btn', 'id_birthday', 'id_state', 'id_tail', 'id_invalid',
  'id_src_sspi', 'id_src_wanted', 'id_src_sprm', 'id_src_note',
  'common_pending_tag', 'common_copy', 'common_copied', 'app_name',
  'common_pending', 'home_risk_clean', 'id_three',
]

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    query: '',
    loading: false,
    mykad: null as MyKadInfo | null,
    sources: [] as Array<{ key: string; status: SourceStatus }>,
    errMsg: '',
  },

  lifetimes: {
    attached() {
      this.refreshChrome()
    },
  },

  pageLifetimes: {
    show() {
      this.refreshChrome()
    },
  },

  methods: {
    refreshChrome() {
      this.setData({
        themeClass: resolveTheme(getThemeMode()) === 'dark' ? 'th-dark' : 'th-light',
        s: stringsFor(getLang(), S),
      })
    },

    onQueryInput(e: WechatMiniprogram.Input) {
      this.setData({ query: e.detail.value })
      // 输入即本地解析（同原版：解析不依赖网络）
      const digits = e.detail.value.replace(/[^0-9]/g, '')
      if (isMyKadValid(digits)) {
        this.setData({ mykad: parseMyKad(digits), errMsg: '' })
      } else if (!digits) {
        this.setData({ mykad: null, errMsg: '' })
      }
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

    async onSearch() {
      haptic.tap()
      const q = (this.data.query || '').trim()
      if (!isMyKadValid(q)) {
        haptic.warn()
        this.setData({ errMsg: this.data.s.id_invalid, mykad: null })
        return
      }
      const mykad = parseMyKad(q)!
      this.setData({ mykad, errMsg: '', loading: true })

      const keys = ['id_src_sspi', 'id_src_wanted', 'id_src_sprm']
      const res = await identityCheck(mykad.ic)
      const list = this.foldRemote(res.state === 'ok' ? res.data : undefined, res.state)
      this.setData({ loading: false, sources: keys.map((k, i) => ({ key: k, status: list[i] })) })
      // 历史记录取最严重结论：任一命中即 hit
      const worst: RiskLevel = list.some((x) => x.risk === 'hit') ? 'hit' : (list.every((x) => x.risk === 'clean') ? 'clean' : 'unknown')
      haptic.risk(worst)
      addHistory('identity', mykad.ic, worst)
    },

    /** 后端返回 → 按 SSPI / 通缉 / SPRM 三源分别折算状态，顺序与 keys 一致 */
    foldRemote(d: IdentityRemoteResult | undefined, state: 'ok' | 'pending' | 'error'): SourceStatus[] {
      if (state !== 'ok' || !d) {
        return [
          { state, risk: 'unknown' },
          { state, risk: 'unknown' },
          { state, risk: 'unknown' },
        ]
      }
      const wantedHit = !!(d.wanted && d.wanted.length > 0)
      const sprmHit = !!(d.sprm && d.sprm.length > 0)
      return [
        {
          state: 'ok',
          risk: 'clean',
          summary: d.sspi && d.sspi.statusCode ? d.sspi.statusCode : this.data.s.common_pending,
        },
        {
          state: 'ok',
          risk: wantedHit ? 'hit' : 'clean',
          summary: wantedHit ? `${d.wanted.length}` : this.data.s.home_risk_clean,
        },
        {
          state: 'ok',
          risk: sprmHit ? 'hit' : 'clean',
          summary: sprmHit ? `${d.sprm.length}` : this.data.s.home_risk_clean,
        },
      ]
    },
  },
})
