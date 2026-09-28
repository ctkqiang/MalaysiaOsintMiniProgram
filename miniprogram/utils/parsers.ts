// MyKad / SSM 本地解析器
// 规则与原版 Kotlin 实现逐条对齐（MyKadParser.kt / SSMParser.kt / OSINTModels.kt）
import { MyKadInfo, SSMInfo } from './models'

/** 16 州属代码 → 名称（与原版 MalaysianState 枚举一致） */
const STATES: Array<[string, string, string]> = [
  ['01', 'Johor', '柔佛'],
  ['02', 'Kedah', '吉打'],
  ['03', 'Kelantan', '吉兰丹'],
  ['04', 'Malacca', '马六甲'],
  ['05', 'Negeri Sembilan', '森美兰'],
  ['06', 'Pahang', '彭亨'],
  ['07', 'Penang', '槟城'],
  ['08', 'Perak', '霹雳'],
  ['09', 'Perlis', '玻璃市'],
  ['10', 'Selangor', '雪兰莪'],
  ['11', 'Terengganu', '登嘉楼'],
  ['12', 'Sabah', '沙巴'],
  ['13', 'Sarawak', '砂拉越'],
  ['14', 'Kuala Lumpur', '吉隆坡'],
  ['15', 'Labuan', '纳闽'],
  ['16', 'Putrajaya', '布城'],
]

/** 7 类 SSM 实体（与原版 SSMEntityType 枚举一致） */
const SSM_TYPES: Array<[string, string, string]> = [
  ['01', 'Local Company', '本地公司'],
  ['02', 'Foreign Company', '外国公司'],
  ['03', 'Business', '商业实体'],
  ['04', 'Local LLP', '本地有限责任合伙企业'],
  ['05', 'Foreign LLP', '外国有限责任合伙企业'],
  ['06', 'Local Professional LLP', '本地专业执业有限责任合伙企业'],
]

function onlyDigits(s: string): string {
  return s.replace(/[^0-9]/g, '')
}

/** 校验：去非数字后至少 12 位（同原版 isValid） */
export function isMyKadValid(input: string): boolean {
  return onlyDigits(input).length >= 12
}

/**
 * 解析 MyKad：
 * - 第 1-6 位 YYMMDD，YY > 30 归 19xx，否则 20xx
 * - 第 7-8 位州属代码
 * - 第 9-12 位唯一尾号
 */
export function parseMyKad(input: string): MyKadInfo | null {
  const digits = onlyDigits(input)
  if (digits.length < 12) {
    return null
  }
  const normalized = digits.slice(0, 12)

  const yy = parseInt(normalized.slice(0, 2), 10)
  const year = (yy > 30 ? '19' : '20') + normalized.slice(0, 2)
  const month = normalized.slice(2, 4)
  const day = normalized.slice(4, 6)
  const birthday = `${year}-${month}-${day}`

  const stateCode = normalized.slice(6, 8)
  const hit = STATES.find((s) => s[0] === stateCode)
  const stateName = hit ? hit[1] : 'Unknown'
  const stateNameCn = hit ? hit[2] : `未知(${stateCode})`

  return {
    ic: normalized,
    birthday,
    stateCode,
    stateName,
    stateNameCn,
    identifier: normalized.slice(8, 12),
  }
}

export function isSSMValid(input: string): boolean {
  return onlyDigits(input).length >= 10
}

/**
 * 解析 SSM 注册号（同原版 normalize + parse）：
 * 不足 12 位左补零，第 5-6 位为实体类型码，未匹配归「未知实体」
 */
export function parseSSM(input: string): SSMInfo | null {
  const digits = onlyDigits(input)
  const normalized = digits.length >= 12 ? digits.slice(0, 12) : digits.padStart(12, '0')

  const entityCode = normalized.slice(4, 6)
  const hit = SSM_TYPES.find((s) => s[0] === entityCode)

  return {
    registrationNumber: normalized,
    entityCode,
    entityType: hit ? hit[1] : 'Unknown Entity',
    entityTypeCn: hit ? hit[2] : '未知实体',
  }
}
