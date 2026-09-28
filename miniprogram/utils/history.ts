// 搜索历史（对应原版 SQLite SearchHistoryStore 的 upsert + 分类型裁剪策略，
// 小程序端用 storage 实现同等语义）
import { HistoryEntry, QueryType, RiskLevel } from './models'

const KEY = 'search_history'
const PER_TYPE_LIMIT = 20
const GLOBAL_LIMIT = 200

function readAll(): HistoryEntry[] {
  const raw = wx.getStorageSync(KEY)
  return Array.isArray(raw) ? raw : []
}

function writeAll(list: HistoryEntry[]): void {
  wx.setStorageSync(KEY, list)
}

/** upsert：同 query 同 type 覆盖旧记录并置顶时间 */
export function addHistory(type: QueryType, query: string, risk: RiskLevel): void {
  const list = readAll().filter((h) => !(h.type === type && h.query === query))
  list.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    query,
    risk,
    ts: Date.now(),
  })
  // 分类型裁剪 → 全局裁剪（同原版策略）
  const counts: Partial<Record<QueryType, number>> = {}
  const pruned: HistoryEntry[] = []
  for (const h of list) {
    const c = counts[h.type]
    counts[h.type] = (c ? c : 0) + 1
    if (counts[h.type]! <= PER_TYPE_LIMIT) {
      pruned.push(h)
    }
  }
  writeAll(pruned.slice(0, GLOBAL_LIMIT))
}

export function listHistory(limit?: number): HistoryEntry[] {
  const all = readAll()
  return limit ? all.slice(0, limit) : all
}

export function clearHistory(): void {
  writeAll([])
}
