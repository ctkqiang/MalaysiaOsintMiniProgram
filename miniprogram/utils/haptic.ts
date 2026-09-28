// 触感反馈统一封装（wx.vibrateShort / vibrateLong）
//
// 场景约定：
//   tap()      轻 — 普通点击（导航、展开、按钮）
//   select()   轻 — 选项切换（主题/语言/开关）
//   success()  中 — 操作成功（复制完成、订阅成功）
//   warn()     长 — 需要留意（免责声明确认门、重置）
//   risk()     按风险分级 — 查询出结论：hit 重震 / clean 中 / unknown 长
//
// 设置页可全局关闭（settings.haptics）。iOS 上 vibrateShort 的 type 无效
// 但仍会震动；真机无震动马达时静默失败，不影响功能。
import { getHaptics, setHaptics } from './settings'

function short(type: 'light' | 'medium' | 'heavy'): void {
  if (!getHaptics()) return
  try {
    wx.vibrateShort({ type, fail: () => undefined })
  } catch (e) {
    /* 低版本基础库忽略 */
  }
}

export function tap(): void {
  short('light')
}

export function select(): void {
  short('light')
}

export function success(): void {
  short('medium')
}

export function warn(): void {
  if (!getHaptics()) return
  try {
    wx.vibrateLong({ fail: () => undefined })
  } catch (e) {
    /* ignore */
  }
}

export function riskHit(): void {
  short('heavy')
}

export function risk(level: 'hit' | 'clean' | 'unknown'): void {
  if (level === 'hit') riskHit()
  else if (level === 'clean') short('medium')
  else warn()
}

export { getHaptics, setHaptics }
