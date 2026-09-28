// 设置持久化（对应原版 DataStore）+ 应用级缓存读写
import { Lang, ThemeMode, ResolvedTheme } from './models'

const KEY_LANG = 'settings.lang'
const KEY_THEME = 'settings.theme'
const KEY_DISCLAIMER = 'settings.disclaimer_ok'

export function getLang(): Lang {
  const v = wx.getStorageSync(KEY_LANG)
  return v === 'en' || v === 'ms' ? v : 'zh'
}

export function setLang(lang: Lang): void {
  wx.setStorageSync(KEY_LANG, lang)
}

export function getThemeMode(): ThemeMode {
  const v = wx.getStorageSync(KEY_THEME)
  return v === 'dark' || v === 'system' ? v : 'light'
}

export function setThemeMode(mode: ThemeMode): void {
  wx.setStorageSync(KEY_THEME, mode)
}

/** 解析实际生效主题：system 时跟随微信客户端深色模式 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    try {
      const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
      return info.theme === 'dark' ? 'dark' : 'light'
    } catch (e) {
      return 'light'
    }
  }
  return mode
}

export function isDisclaimerAccepted(): boolean {
  return wx.getStorageSync(KEY_DISCLAIMER) === true
}

export function acceptDisclaimer(): void {
  wx.setStorageSync(KEY_DISCLAIMER, true)
}
