// 共享数据模型（对应原 Android 工程 :core:model）

export type Lang = 'zh' | 'en' | 'ms'
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type QueryType = 'semak' | 'identity' | 'company' | 'court' | 'social'
export type RiskLevel = 'clean' | 'hit' | 'unknown'

/** MyKad 本地解析结果（字段语义与原版 MyKadParser 一致） */
export interface MyKadInfo {
  ic: string          // 标准化 12 位
  birthday: string    // YYYY-MM-DD
  stateCode: string   // 第 7-8 位
  stateName: string   // 州属英文名，未匹配为 Unknown
  stateNameCn: string // 州属中文名，未匹配为 未知(XX)
  identifier: string  // 第 9-12 位
}

/** SSM 注册号解析结果（与原版 SSMParser 一致） */
export interface SSMInfo {
  registrationNumber: string
  entityCode: string   // 第 5-6 位
  entityType: string   // 英文实体类型
  entityTypeCn: string // 中文实体类型
}

export interface SemakMuleResult {
  count: number
  rows: string[][]
}

export interface BnmAlert {
  name: string
  website: string
  date: string
}

export interface CompanyInfo {
  name: string
  category: string
  address: string
  website: string
}

export interface HistoryEntry {
  id: string
  type: QueryType
  query: string
  risk: RiskLevel
  ts: number
}

/** 统一 API 层三态：后端已配置且成功 / 未配置后端 / 请求失败 */
export type ApiState = 'ok' | 'pending' | 'error'

export interface ApiResult<T> {
  state: ApiState
  data?: T
  message?: string
}

/** 身份证三源核验中单源的展示状态 */
export interface SourceStatus {
  state: ApiState
  summary?: string
  risk?: RiskLevel
}

/** e-Court 判决书列表条目（字段对齐原版 ECourtItem 清洗后语义） */
export interface ECourtItem {
  caseNo: string
  /** 从案号尾部括号提取的法院名 */
  court: string
  parties: string
  keyWord: string
  dateOfAp: string
  dateOfResult: string
  judge: string
  corumJudge: string
  /** 文书 ID：用于拼接 DocDownloader 链接 */
  documentId: string
}

export interface ECourtResult {
  totalRecord: number
  totalPage: number
  currPage: number
  items: ECourtItem[]
}

/** 社交枚举单条命中 */
export interface SocialHit {
  platform: string
  category: string
  url: string
  username: string
}

/** 订阅消息（推送）本地状态 */
export interface PushState {
  /** 用户是否开启 BNM 警示推送 */
  on: boolean
  /** 最近一次订阅授权结果：none 未申请 / ok 已授权 / reject 拒绝 / fail 失败 */
  last: 'none' | 'ok' | 'reject' | 'fail'
}
