// 订阅消息推送（小程序端的"推送通知"实现）
//
// 微信小程序不允许客户端自主推送，通知统一走「订阅消息」：
//   1. 用户在设置页打开开关 → 前端调 requestSubscribeMessage 申请一次性/长期订阅
//   2. 授权结果（accept/reject/ban）连同场景上报后端
//   3. 后端 BNM 轮询 watcher 发现新警示条目时，调用微信 subscribeMessage.send 下发
//
// BNM_TEMPLATE_ID 需替换为你在「微信公众平台-订阅消息」申请的模板 ID，
// 且该模板须已配置下发场景字段（如机构名称/警示日期）。
import { subscribeReport } from './api'

export const BNM_TEMPLATE_ID = ''

export type PushScenes = 'bnm_alert'

export interface PushPref {
  on: boolean
  /** 最近一次授权结果，用于 UI 说明 */
  last: 'none' | 'ok' | 'reject' | 'fail'
}

const KEY = 'settings.push'

export function getPushPref(): PushPref {
  const v = wx.getStorageSync(KEY)
  if (v && typeof v === 'object') {
    return { on: !!v.on, last: v.last || 'none' }
  }
  return { on: false, last: 'none' }
}

export function setPushPref(pref: PushPref): void {
  wx.setStorageSync(KEY, pref)
}

export function pushTemplateReady(): boolean {
  return BNM_TEMPLATE_ID.length > 0
}

/**
 * 申请订阅并上报后端。返回最新偏好；调用方负责 setData。
 * - 用户手势内调用（bindtap 同步链路上），否则微信直接判 fail
 * - 未配置模板 ID 时不发起弹窗，返回 on=false 让 UI 显示「待接入」
 */
export async function enablePush(scenes: PushScenes[] = ['bnm_alert']): Promise<PushPref> {
  if (!pushTemplateReady()) {
    const pref: PushPref = { on: false, last: 'none' }
    setPushPref(pref)
    return pref
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [BNM_TEMPLATE_ID],
      success: (res) => {
        const status = (res as Record<string, string>)[BNM_TEMPLATE_ID]
        const ok = status === 'accept'
        const pref: PushPref = {
          on: ok,
          last: ok ? 'ok' : status === 'reject' ? 'reject' : 'fail',
        }
        setPushPref(pref)
        if (ok) {
          // 上报订阅授权给后端，由后端持有 openid+模板并负责实际下发
          subscribeReport({ templateId: BNM_TEMPLATE_ID, action: 'accept', scenes })
            .then(() => undefined)
            .catch(() => undefined)
        }
        resolve(pref)
      },
      fail: () => {
        const pref: PushPref = { on: false, last: 'fail' }
        setPushPref(pref)
        resolve(pref)
      },
    })
  })
}

/** 关闭本地推送意愿（微信侧无法代用户取消订阅，仅停止上报续订） */
export function disablePush(): PushPref {
  const pref: PushPref = { on: false, last: getPushPref().last }
  setPushPref(pref)
  return pref
}
