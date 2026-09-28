// 企业查询：SSM 注册号本地解析（牌匾卡）+ 黄页/反诈交叉验证（待接入后端）
import { companySearch } from '../../utils/api'
import { parseSSM, isSSMValid } from '../../utils/parsers'
import { stringsFor } from '../../utils/i18n'
import { getLang, getThemeMode, resolveTheme } from '../../utils/settings'
import { addHistory } from '../../utils/history'
import { CompanyInfo, SSMInfo } from '../../utils/models'
import * as haptic from '../../utils/haptic'

const S = [
  'co_title', 'co_ph', 'co_btn', 'co_entity', 'co_entity_code', 'co_regno', 'co_invalid',
  'co_yp_title', 'co_no_result',
  'common_copy', 'common_copied', 'home_risk_unknown',
]

Component({
  data: {
    themeClass: 'th-light' as 'th-light' | 'th-dark',
    s: {} as Record<string, string>,
    query: '',
    loading: false,
    ssm: null as SSMInfo | null,
    company: null as CompanyInfo | null,
    notFound: false,
    failed: false,
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
      const digits = e.detail.value.replace(/[^0-9]/g, '')
      if (isSSMValid(digits)) {
        this.setData({ ssm: parseSSM(digits), errMsg: '' })
      } else if (!digits) {
        this.setData({ ssm: null, errMsg: '' })
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
      if (!isSSMValid(q)) {
        haptic.warn()
        this.setData({ errMsg: this.data.s.co_invalid, ssm: null })
        return
      }
      const ssm = parseSSM(q)!
      this.setData({ ssm, errMsg: '', loading: true, company: null, notFound: false, failed: false })

      const res = await companySearch(ssm.registrationNumber)
      if (res.state === 'ok' && res.data && res.data.name) {
        haptic.success()
        this.setData({ loading: false, company: res.data })
        addHistory('company', ssm.registrationNumber, 'clean')
      } else if (res.state === 'ok') {
        // 黄页无结果：交叉验证未命中
        haptic.risk('unknown')
        this.setData({ loading: false, notFound: true })
        addHistory('company', ssm.registrationNumber, 'unknown')
      } else {
        // 网络/解析失败
        haptic.warn()
        this.setData({ loading: false, notFound: true, failed: true })
        addHistory('company', ssm.registrationNumber, 'unknown')
      }
    },
  },
})
