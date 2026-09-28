// 订阅消息推送（小程序端的"推送通知"实现）
//
// 微信小程序不允许客户端自主推送，通知统一走「订阅消息」：
//   1. 用户在设置页打开场景开关 → 前端调 requestSubscribeMessage 批量申请（一次最多 3 条模板）
//   2. 授权结果（accept/reject/ban）连同场景上报后端
//   3. 后端 watcher（BNM 轮询 / Semak 命中回扫 / 法庭新判决）发现事件时，
//      调用微信 subscribeMessage.send 下发
//
// 模板 ID 需在「微信公众平台 → 功能 → 订阅消息」申请，并保证各模板标题互不相同，
// 否则同名模板会被后台 filter 过滤。留空 = 该场景未接入（UI 显示待配置）。
import { subscribeReport } from './api'

export type PushScene = 'bnm_alert' | 'semak_hit' | 'court_new'

export interface SceneTemplate {
  scene: PushScene
  templateId: string
}

/** 三个推送场景的模板位（⬅️ 申请到模板 ID 后填入对应项） */
export const SCENE_TEMPLATES: SceneTemplate[] = [
  { scene: 'bnm_alert', templateId: '' },
  { scene: 'semak_hit', templateId: '' },
  { scene: 'court_new', templateId: '' },
]

export interface PushPref {
  /** 各场景开关状态 */
  scenes: Record<PushScene, boolean>
  /** 最近一次批量申请的逐模板结果：accept/reject/ban/filter */
  last: 'none' | 'ok' | 'partial' | 'reject' | 'fail'
}

const KEY = 'settings.push'

function emptyScenes(): Record<PushScene, boolean> {
  return { bnm_alert: false, semak_hit: false, court_new: false }
}

export function getPushPref(): PushPref {
  const v = wx.getStorageSync(KEY)
  if (v && typeof v === 'object' && v.scenes) {
    return {
      scenes: Object.assign(emptyScenes(), v.scenes),
      last: v.last || 'none',
    }
  }
  return { scenes: emptyScenes(), last: 'none' }
}

export function setPushPref(pref: PushPref): void {
  wx.setStorageSync(KEY, pref)
}

/** 已配置模板 ID 的场景列表 */
export function readyScenes(): SceneTemplate[] {
  return SCENE_TEMPLATES.filter((t) => t.templateId.length > 0)
}

export function sceneTemplateId(scene: PushScene): string {
  const hit = SCENE_TEMPLATES.filter((t) => t.scene === scene)[0]
  return hit ? hit.templateId : ''
}

/**
 * 批量申请订阅并上报后端。必须在用户手势的同步调用链中触发。
 * - 未配置任何模板时直接返回 last=none，UI 显示「待配置」
 * - 一次最多申请 3 条模板（微信上限），恰好覆盖三个场景
 */
export function enablePush(scenes?: PushScene[]): Promise<PushPref> {
  const ready = readyScenes()
  const wanted = scenes && scenes.length > 0
    ? ready.filter((t) => scenes.indexOf(t.scene) !== -1)
    : ready
  if (wanted.length === 0) {
    const pref: PushPref = { scenes: getPushPref().scenes, last: 'none' }
    setPushPref(pref)
    return Promise.resolve(pref)
  }
  const tmplIds = wanted.map((t) => t.templateId)
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted: PushScene[] = []
        let rejected = 0
        for (let i = 0; i < wanted.length; i++) {
          const status = (res as Record<string, string>)[wanted[i].templateId]
          if (status === 'accept') accepted.push(wanted[i].scene)
          else rejected++
        }
        const pref = getPushPref()
        for (const s of accepted) pref.scenes[s] = true
        for (let i = 0; i < wanted.length; i++) {
          if (accepted.indexOf(wanted[i].scene) === -1) {
            pref.scenes[wanted[i].scene] = false
          }
        }
        pref.last = accepted.length === wanted.length
          ? 'ok'
          : accepted.length > 0 ? 'partial' : 'reject'
        setPushPref(pref)
        if (accepted.length > 0) {
          // 上报订阅授权给后端，由后端持有 openid+模板并负责实际下发
          subscribeReport({
            templateId: wanted[0].templateId,
            action: 'accept',
            scenes: accepted,
          })
            .then(() => undefined)
            .catch(() => undefined)
        }
        resolve(pref)
      },
      fail: () => {
        const pref = getPushPref()
        pref.last = 'fail'
        setPushPref(pref)
        resolve(pref)
      },
    })
  })
}

/** 关闭某场景的本地推送意愿（微信侧无法代用户取消订阅，仅停止续订上报） */
export function disableScene(scene: PushScene): PushPref {
  const pref = getPushPref()
  pref.scenes[scene] = false
  setPushPref(pref)
  return pref
}

/** 兼容旧调用：总开关 = 任一场景开启 */
export function pushEnabled(): boolean {
  const s = getPushPref().scenes
  return s.bnm_alert || s.semak_hit || s.court_new
}
