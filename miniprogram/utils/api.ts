// 统一 API 层 —— 直连政府公开接口（1:1 移植原版 OSINTRepository 的 Kotlin 实现）
//
// 两种模式：
//   1) 直连模式（默认，BASE_URL 留空）：与原版 Android 完全一致，直接请求
//      PDRM / SSPI / SPRM / BNM / e-Court / MalaysiaYP 公开接口。
//      请求头、请求体、解析逻辑逐条对应 .analysis/MalaysianOSINTAPP
//      （OSINTService.kt / ApiClient.kt / OSINTRepository.kt）。
//   2) 代理模式（BASE_URL 填了 https 域名）：全部走自建后端 JSON 接口。
//      正式发布必须用代理：小程序「合法域名」白名单只收自有备案域名，
//      政府 .gov.my 域名无法登记。
//
// ⚠️ 直连调试前提：微信开发者工具「详情 → 本地设置 → 不校验合法域名，
//    web-view(业务域名)、TLS 版本以及 HTTPS 证书」必须勾选。
//    真机预览需在手机上打开「开发调试」。
//    注：semakmule.rmp.gov.my 服务端证书链缺中间证书（原版 Kotlin 用
//    trust-all SSL 绕过；小程序不可绕过，勾选上述豁免可同时跳过证书校验）。
//
// 代理后端接口约定（REST + JSON，与原注释一致）：
//   POST {BASE}/semakmule        body {query}            -> {count, table_data: string[][]}
//   GET  {BASE}/bnm              ?page=1                 -> {count, entries: [{name,website,date}]}
//   POST {BASE}/identity         body {ic}               -> {sspi:{statusCode}, wanted:[...], sprm:[...]}
//   GET  {BASE}/company          ?q=ssmNo                -> {name,category,address,website}
//   POST {BASE}/ecourt           body {search,currPage}  -> {totalRecord, items:[...]}
//   POST {BASE}/social           body {username}         -> {hits:[{platform,url,username}]}
//   POST {BASE}/subscribe        body {templateId,action,scenes} -> {ok:true}
import {
  ApiResult,
  BnmAlert,
  CompanyInfo,
  ECourtItem,
  ECourtResult,
  SemakMuleResult,
  SocialHit,
  SourceStatus,
} from './models'

/** 可选：填入代理后端 https 域名（需与小程序后台「服务器域名」一致）；留空 = 直连模式 */
export const BASE_URL = ''

export function backendReady(): boolean {
  return BASE_URL.length > 0
}

const TIMEOUT = 20000
const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

// ============================================================
// 底层请求封装
// ============================================================

interface RawOptions {
  url: string
  method: 'GET' | 'POST' | 'HEAD'
  body?: string
  header?: Record<string, string>
}

/** 文本模式请求：statusCode=-1 表示网络失败（对齐 OkHttp 超时/异常 → Result.failure） */
function raw(o: RawOptions): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve) => {
    const opt = {
      url: o.url,
      method: o.method,
      data: o.body || '',
      timeout: TIMEOUT,
      dataType: 'text',
      header: Object.assign({ 'User-Agent': UA }, o.header || {}),
      success: (res: { statusCode: number; data: unknown }) => {
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        resolve({ statusCode: res.statusCode, text })
      },
      fail: (err: { errMsg?: string }) => resolve({ statusCode: -1, text: err.errMsg || '' }),
    }
    wx.request(opt as unknown as WechatMiniprogram.RequestOption)
  })
}

/** 代理模式通用 JSON 请求 */
function viaProxy<T>(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data: data as WechatMiniprogram.IAnyObject,
      timeout: TIMEOUT,
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ state: 'ok', data: res.data as T })
        } else {
          resolve({ state: 'error', message: `http_${res.statusCode}` })
        }
      },
      fail: (err) => resolve({ state: 'error', message: err.errMsg || 'network_fail' }),
    })
  })
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ============================================================
// 轻量 HTML 解析（替代原版 Jsoup）
// ============================================================

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]*>/g, '')
}

function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractBetween(text: string, start: string, end: string): string | null {
  const i = text.indexOf(start)
  if (i === -1) return null
  const from = i + start.length
  const j = text.indexOf(end, from)
  if (j === -1) return null
  return decodeEntities(stripTags(text.slice(from, j))).trim()
}

/** 提取指定 class 的 <div> 完整块（含嵌套配平），近似 Jsoup select("div.xxx") */
function findDivBlocks(html: string, className: string): string[] {
  const blocks: string[] = []
  const divOpen = /<div\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = divOpen.exec(html))) {
    const tag = match[0]
    const cls = /class="([^"]*)"/i.exec(tag)
    if (!cls || cls[1].indexOf(className) === -1) continue
    let depth = 1
    const nest = /<div\b[^>]*>|<\/div>/gi
    nest.lastIndex = match.index + tag.length
    let t: RegExpExecArray | null
    let end = -1
    while ((t = nest.exec(html))) {
      if (t[0].charAt(1) === '/') depth--
      else depth++
      if (depth === 0) {
        end = t.index
        break
      }
    }
    if (end === -1) break
    blocks.push(html.slice(match.index, end + 6))
    divOpen.lastIndex = end + 6
  }
  return blocks
}

/** 近似 Jsoup Element.text()：块级元素结束转换行，去标签、解实体，返回非空行数组 */
function blockLines(html: string): string[] {
  const withBreaks = html
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  return decodeEntities(stripTags(withBreaks))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
}

/** Jsoup text() 等价：全部文本压成一行 */
function blockText(html: string): string {
  return blockLines(html).join(' ')
}

function pick(it: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = it[k]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

// ============================================================
// 反诈查询 Semak Mule（对应 checkSemakMule：apikey/Origin/Referer 头 + 嵌套 data 体）
// ============================================================

/**
 * 反诈结果归一化。
 *
 * ⚠️ 服务端 `count` 字段不可用于风险判定：实测对任意关键词（含乱码）都返回
 * 递增的 count（如 hsjs→1、najib→2、0137397193→45），而 table_data 均为空数组，
 * 它是 DataTables 的分页总数而非命中条数。命中与否只能以实际返回的行数为准。
 */
function normalizeSemak(d: Record<string, unknown>): SemakMuleResult {
  const rawRows = (d.table_data || d.rows || []) as string[][]
  const rows = Array.isArray(rawRows) ? rawRows.filter((r) => Array.isArray(r) && r.length > 0) : []
  return {
    count: rows.length,
    rows,
  }
}

export async function semakMule(query: string): Promise<ApiResult<SemakMuleResult>> {
  if (backendReady()) {
    const res = await viaProxy<Record<string, unknown>>('/semakmule', 'POST', { query })
    if (res.state === 'ok' && res.data) return { state: 'ok', data: normalizeSemak(res.data) }
    return { state: res.state, message: res.message }
  }
  const body = JSON.stringify({
    data: {
      category: 'telefon',
      bankAccount: query,
      telNo: query,
      companyName: '',
      captcha: '',
    },
  })
  const r = await raw({
    url: 'https://semakmule.rmp.gov.my/api/mule/get_search_data.php',
    method: 'POST',
    body,
    header: {
      apikey: 'j3j389#nklala2',
      Origin: 'https://semakmule.rmp.gov.my',
      Referer: 'https://semakmule.rmp.gov.my/',
      'content-type': 'application/json',
    },
  })
  if (!isOk(r.statusCode) || !r.text) {
    return { state: 'error', message: `http_${r.statusCode}` }
  }
  try {
    return { state: 'ok', data: normalizeSemak(JSON.parse(r.text)) }
  } catch (e) {
    return { state: 'error', message: 'bad_json' }
  }
}

// ============================================================
// BNM 消费者警示名单（对应 getBNMAlertList：GET + tbody 表格解析）
// ============================================================

function parseBnmTable(html: string): BnmAlert[] {
  const entries: BnmAlert[] = []
  const start = html.indexOf('<tbody')
  if (start === -1) return entries
  const end = html.indexOf('</tbody>', start)
  const section = html.slice(start, end === -1 ? html.length : end)
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  const rowChunks = section.split(/<tr[^>]*>/i).slice(1)
  for (const row of rowChunks) {
    const cols: string[] = []
    let m: RegExpExecArray | null
    tdRe.lastIndex = 0
    while ((m = tdRe.exec(row))) {
      cols.push(decodeEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim())
    }
    if (cols.length >= 3) {
      entries.push({ name: cols[0], website: cols[1], date: cols[2] })
    }
  }
  return entries
}

export async function bnmAlerts(page = 1): Promise<ApiResult<{ count: number; entries: BnmAlert[] }>> {
  if (backendReady()) {
    return viaProxy<{ count: number; entries: BnmAlert[] }>('/bnm', 'GET', { page })
  }
  const r = await raw({ url: 'https://www.bnm.gov.my/financial-consumer-alert-list', method: 'GET' })
  if (!isOk(r.statusCode)) {
    return { state: 'error', message: `http_${r.statusCode}` }
  }
  const entries = parseBnmTable(r.text)
  return { state: 'ok', data: { count: entries.length, entries } }
}

// ============================================================
// 身份证综合查询（SSPI 表单 POST + 通缉名单 + SPRM，对应 querySSPI/queryWantedList/querySPRM）
// ============================================================

export interface IdentityRemoteResult {
  sspi: { statusCode: string }
  wanted: Array<{ name: string; age: string }>
  sprm: Array<{ name: string; caseNo: string }>
}

async function directSspi(ic: string): Promise<string> {
  const r = await raw({
    url: 'https://sspi.imi.gov.my/sspi/index.php?page=sspi/bm',
    method: 'POST',
    body: `txtIcNo=${encodeURIComponent(ic)}&btnSemak=Semak`,
    header: {
      'User-Agent': 'libcurl-agent/1.0',
      'content-type': 'application/x-www-form-urlencoded',
    },
  })
  if (!isOk(r.statusCode) || !r.text) return ''
  return (
    extractBetween(r.text, '<span id="lblStatuscode">', '</span>') ||
    extractBetween(r.text, "<span id='lblStatuscode'>", '</span>') ||
    '查无记录'
  )
}

async function directWanted(ic: string): Promise<Array<{ name: string; age: string }>> {
  const r = await raw({ url: 'https://www.rmp.gov.my/orang-dikehendaki', method: 'GET' })
  if (!isOk(r.statusCode)) return []
  const out: Array<{ name: string; age: string }> = []
  for (const block of findDivBlocks(r.text, 'wanted-person')) {
    if (blockText(block).toUpperCase().indexOf(ic.toUpperCase()) === -1) continue
    const nameM = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(block)
    const ageM = /<span[^>]*class="[^"]*age[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block)
    const name = blockText(nameM ? nameM[1] : '')
    const age = blockText(ageM ? ageM[1] : '')
    out.push({ name: name || blockLines(block)[0] || '', age })
  }
  return out
}

async function directSprm(keyword: string): Promise<Array<{ name: string; caseNo: string }>> {
  const r = await raw({ url: 'https://www.sprm.gov.my/index.php?page_id=96', method: 'GET' })
  if (!isOk(r.statusCode)) return []
  const out: Array<{ name: string; caseNo: string }> = []
  for (const block of findDivBlocks(r.text, 'div-pesalah')) {
    const lines = blockLines(block)
    const joined = lines.join(' ')
    if (joined.toUpperCase().indexOf(keyword.toUpperCase()) === -1) continue
    out.push({ name: lines[0] || '', caseNo: lines[5] || '' })
  }
  return out
}

export async function identityCheck(ic: string): Promise<ApiResult<IdentityRemoteResult>> {
  if (backendReady()) {
    return viaProxy<IdentityRemoteResult>('/identity', 'POST', { ic })
  }
  const [status, wanted, sprm] = await Promise.all([
    directSspi(ic),
    directWanted(ic),
    directSprm(ic),
  ])
  return { state: 'ok', data: { sspi: { statusCode: status }, wanted, sprm } }
}

// ============================================================
// 企业查询 MalaysiaYP（对应 searchCompany：GET + 首个结果抽取）
// ============================================================

function firstMatch(html: string, re: RegExp): string {
  const m = re.exec(html)
  return m ? blockText(m[1]) : ''
}

export async function companySearch(ssmNo: string): Promise<ApiResult<CompanyInfo>> {
  if (backendReady()) {
    return viaProxy<CompanyInfo>('/company', 'GET', { q: ssmNo })
  }
  const url = `https://malaysiayp.com/?s=${encodeURIComponent(ssmNo)}&location-address=&a=true`
  const r = await raw({ url, method: 'GET' })
  if (!isOk(r.statusCode) || !r.text) {
    return { state: 'error', message: `http_${r.statusCode}` }
  }
  const html = r.text
  const name = firstMatch(html, /<h3[^>]*>([\s\S]*?)<\/h3>/i)
  if (!name) {
    return { state: 'ok', data: { name: '', category: '', address: '', website: '' } }
  }
  return {
    state: 'ok',
    data: {
      name,
      category: firstMatch(html, /<span[^>]*class="[^"]*item-category[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      address: firstMatch(html, /<span[^>]*class="[^"]*value[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      website: firstMatch(html, /<div[^>]*class="[^"]*item-web[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    },
  }
}

// ============================================================
// 电子法庭 e-Court（对应 searchECourt：ASMX JSON + 3 次重试间隔 3s）
// ============================================================

export interface ECourtRemoteParam {
  totalRecord?: number
  totalPage?: number
  currPage?: number
  items?: Array<Record<string, unknown>>
}

export async function ecourtSearch(
  search: string,
  currPage = 1,
  jurisdictionType = 'ALL'
): Promise<ApiResult<ECourtRemoteParam>> {
  if (backendReady()) {
    return viaProxy<ECourtRemoteParam>('/ecourt', 'POST', {
      search,
      currPage,
      jurisdictionType,
      ordering: 'DATE_OF_AP_DESC',
    })
  }
  const payload = {
    Param: {
      CourtCategory: '',
      Court: '',
      JurisdictionType: jurisdictionType,
      DateOfAPFrom: null,
      DateOfAPTo: null,
      DateOfResultFrom: null,
      DateOfResultTo: null,
      Search: search,
      JudgeName: '',
      CaseType: '',
      CurrPage: currPage,
      Ordering: 'DATE_OF_AP_DESC',
    },
  }
  let lastMessage = 'request_failed'
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await raw({
      url: 'https://ejudgment.kehakiman.gov.my/EJudgmentWeb/eJudgmentService.asmx/GetEJudgmentPortalSearchList',
      method: 'POST',
      body: JSON.stringify(payload),
      header: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Origin: 'https://ejudgment.kehakiman.gov.my',
        Referer: 'https://ejudgment.kehakiman.gov.my/ejudgmentweb/searchpage.aspx?JurisdictionType=ALL',
        'X-Requested-With': 'XMLHttpRequest',
        'content-type': 'application/json; charset=UTF-8',
      },
    })
    if (isOk(r.statusCode) && r.text && r.text.trim()) {
      try {
        const env = JSON.parse(r.text) as { d?: Record<string, unknown> }
        const d = (env && env.d) || {}
        const items = (d.ListOfSearchItem || d.items || []) as Array<Record<string, unknown>>
        return {
          state: 'ok',
          data: {
            totalRecord: Number(d.TOTAL_RECORD || 0),
            totalPage: Number(d.TOTAL_PAGE || 1),
            currPage: Number(d.CurrPage || currPage || 1),
            items: Array.isArray(items) ? items : [],
          },
        }
      } catch (e) {
        lastMessage = 'bad_json'
      }
    } else if (r.statusCode === -1) {
      // 网络层失败：errMsg 里含域名白名单拦截 / 超时等具体原因，透传给页面
      lastMessage = r.text || 'network_fail'
    } else {
      lastMessage = `http_${r.statusCode}`
    }
    if (attempt < 2) await sleep(3000)
  }
  return { state: 'error', message: lastMessage }
}

/** 服务端 HTML 清洗（对齐原版 stripHtml） */
export function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function docIdOf(it: Record<string, unknown>): string {
  const list = it.ListOfAPDoc || it.listOfAPDoc
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] as Record<string, unknown>
    const id = pick(first, 'DocumentID', 'documentId', 'DocumentId')
    // .NET 全零 GUID 表示无文书
    if (id && id.indexOf('00000000-0000-0000-0000-000000000000') === -1) return id
  }
  const fallback = pick(it, 'documentId', 'eJudgUniqueID')
  return fallback && fallback.indexOf('00000000-0000-0000-0000-000000000000') === -1 ? fallback : ''
}

/** .NET ASMX 日期 /Date(1785211750000)/ → YYYY-MM-DD；非该格式则清洗后原样返回 */
export function foldNetDate(s: string): string {
  const cleaned = stripHtml(s)
  const m = /^\/?Date\((-?\d+)\)\/?$/.exec(cleaned)
  if (!m) return cleaned
  const ms = parseInt(m[1], 10)
  if (isNaN(ms)) return cleaned
  const dt = new Date(ms)
  const mm = dt.getMonth() + 1
  const dd = dt.getDate()
  return dt.getFullYear() + '-' + (mm < 10 ? '0' + mm : '' + mm) + '-' + (dd < 10 ? '0' + dd : '' + dd)
}

/** 案号尾部括号里的法院名（如 "BA-22M-201-06/2024(Mahkamah Tinggi)"）提取为徽章 */
function splitCourt(caseNo: string): { caseNo: string; court: string } {
  const m = /^(.*?)[（(]\s*([^（()）]+?)\s*[)）]\s*$/.exec(caseNo)
  if (m && m[2]) {
    return { caseNo: m[1].trim(), court: m[2].trim() }
  }
  return { caseNo, court: '' }
}

/** 当事人字段：换行转段落，角色行与人名行合并，避免 PLAINTIFSMALL… 粘连 */
function foldParties(s: string): string {
  const lines = blockLines((s || '').replace(/<br\s*\/?>/gi, '\n'))
  if (lines.length === 0) return ''
  // 原版结构常为：角色行（PLAINTIF/RESPONDEN/PERAYU）+ 人名行，交替合并
  const merged: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]
    const next = lines[i + 1]
    if (next && /^(plaintif|plaintiff|responden|defendan|defendant|perayu|terrayu|pendakwa|pemohon|termohon)/i.test(cur)) {
      merged.push(cur + '：' + next)
      i++
    } else {
      merged.push(cur)
    }
  }
  return merged.join('；')
}

/** 后端/信封数据 → 前端展示模型（兼容原版 ASMX 字段名与简化字段名） */
export function foldECourt(d: ECourtRemoteParam | undefined): ECourtResult {
  const rawItems = d && Array.isArray(d.items) ? d.items : []
  const items: ECourtItem[] = rawItems.map((it) => {
    const rawCaseNo = stripHtml(pick(it, 'CaseNo', 'caseNo'))
    const sc = splitCourt(rawCaseNo)
    return {
      caseNo: sc.caseNo,
      court: sc.court,
      parties: foldParties(pick(it, 'Parties', 'parties')),
      keyWord: stripHtml(pick(it, 'KeyWord', 'keyWord')),
      dateOfAp: foldNetDate(pick(it, 'DateOfAP', 'dateOfAp')),
      dateOfResult: foldNetDate(pick(it, 'DateOfResult', 'dateOfResult')),
      judge: stripHtml(pick(it, 'Judge', 'judge')),
      corumJudge: stripHtml(pick(it, 'CorumJudge', 'corumJudge')),
      documentId: docIdOf(it),
    }
  })
  return {
    totalRecord: d && typeof d.totalRecord === 'number' ? d.totalRecord : items.length,
    totalPage: d && typeof d.totalPage === 'number' ? d.totalPage : 1,
    currPage: d && typeof d.currPage === 'number' ? d.currPage : 1,
    items,
  }
}

/** 判决书直链（与原版 DocDownloader 拼接规则一致；小程序内复制后系统浏览器打开） */
export function ecourtDocUrl(documentId: string): string {
  if (!documentId) return ''
  return `https://efs.kehakiman.gov.my/EFSWeb/DocDownloader.aspx?DocumentID=${documentId}&Inline=true`
}

// ============================================================
// 社交账号枚举（对应 searchSocialMedia：全平台 HEAD 探测，2xx 即命中）
// ============================================================

/** 平台清单与 SocialPlatforms.kt 逐条对齐（去重原版重复的 GitHub 行） */
const SOCIAL_PLATFORMS: Array<[string, string, string]> = [
  ['Twitter/X', 'https://x.com/%s', '全球社交'],
  ['Reddit', 'https://www.reddit.com/user/%s', '全球社交'],
  ['Instagram', 'https://www.instagram.com/%s', '全球社交'],
  ['TikTok', 'https://www.tiktok.com/@%s', '全球社交'],
  ['Telegram', 'https://t.me/%s', '即时通讯'],
  ['Facebook', 'https://www.facebook.com/%s', '全球社交'],
  ['YouTube', 'https://www.youtube.com/@%s', '视频平台'],
  ['LinkedIn', 'https://www.linkedin.com/in/%s', '职业社交'],
  ['Snapchat', 'https://www.snapchat.com/add/%s', '全球社交'],
  ['Pinterest', 'https://www.pinterest.com/%s', '全球社交'],
  ['Medium', 'https://medium.com/@%s', '内容平台'],
  ['Twitch', 'https://www.twitch.tv/%s', '游戏直播'],
  ['Discord', 'https://discord.com/users/%s', '即时通讯'],
  ['Flickr', 'https://www.flickr.com/people/%s', '图片分享'],
  ['Spotify', 'https://open.spotify.com/user/%s', '音乐平台'],
  ['Steam', 'https://steamcommunity.com/id/%s', '游戏平台'],
  ['Vimeo', 'https://vimeo.com/%s', '视频平台'],
  ['WordPress', 'https://%s.wordpress.com', '内容平台'],
  ['GitLab', 'https://gitlab.com/%s', '开发者'],
  ['GitHub', 'https://github.com/%s', '开发者'],
  ['Stack Overflow', 'https://stackoverflow.com/users/%s', '开发者'],
  ['HackerNews', 'https://news.ycombinator.com/user?id=%s', '开发者'],
  ['Dev.to', 'https://dev.to/%s', '开发者'],
  ['微博', 'https://weibo.com/%s', '中国社交'],
  ['哔哩哔哩', 'https://space.bilibili.com/%s', '中国社交'],
  ['知乎', 'https://www.zhihu.com/people/%s', '中国社交'],
  ['QQ', 'https://user.qzone.qq.com/%s', '中国社交'],
  ['VK', 'https://vk.com/%s', '俄语社交'],
  ['Odnoklassniki', 'https://ok.ru/%s', '俄语社交'],
  ['AngelList', 'https://angel.co/%s', '职业社交'],
  ['Crunchbase', 'https://www.crunchbase.com/person/%s', '职业社交'],
  ['ProductHunt', 'https://www.producthunt.com/@%s', '职业社交'],
  ['Xing', 'https://www.xing.com/profile/%s', '职业社交'],
  ['ResearchGate', 'https://www.researchgate.net/profile/%s', '学术'],
  ['ORCID', 'https://orcid.org/%s', '学术'],
  ['Google Scholar', 'https://scholar.google.com/citations?user=%s', '学术'],
  ['Academia.edu', 'https://academia.edu/%s', '学术'],
  ['Dribbble', 'https://dribbble.com/%s', '创意设计'],
  ['Behance', 'https://www.behance.net/%s', '创意设计'],
  ['DeviantArt', 'https://www.deviantart.com/%s', '创意设计'],
  ['Patreon', 'https://www.patreon.com/%s', '内容创作'],
  ['SoundCloud', 'https://soundcloud.com/%s', '音乐平台'],
  ['Bandcamp', 'https://%s.bandcamp.com', '音乐平台'],
  ['Figma', 'https://www.figma.com/@%s', '创意设计'],
  ['Lowyat', 'https://forum.lowyat.net/user/%s', '马来西亚'],
  ['Quora', 'https://www.quora.com/profile/%s', '问答社区'],
  ['Roblox', 'https://www.roblox.com/user.aspx?username=%s', '游戏平台'],
  ['Minecraft', 'https://namemc.com/profile/%s', '游戏平台'],
  ['Epic Games', 'https://www.epicgames.com/id/%s', '游戏平台'],
  ['Keybase', 'https://keybase.io/%s', '安全'],
  ['Gravatar', 'https://gravatar.com/%s', '通用'],
  ['About.me', 'https://about.me/%s', '个人主页'],
  ['Linktree', 'https://linktr.ee/%s', '个人主页'],
  ['Tumblr', 'https://%s.tumblr.com', '内容平台'],
  ['Blogger', 'https://%s.blogspot.com', '内容平台'],
  ['Mastodon', 'https://mastodon.social/@%s', '社交网络'],
  ['BlueSky', 'https://bsky.app/profile/%s', '社交网络'],
  ['Threads', 'https://www.threads.net/@%s', '社交网络'],
]

export async function socialEnumerate(username: string): Promise<ApiResult<{ hits: SocialHit[] }>> {
  if (backendReady()) {
    return viaProxy<{ hits: SocialHit[] }>('/social', 'POST', { username })
  }
  const hits: SocialHit[] = []
  // Kotlin 原版为串行探测；小程序并发上限 10，按 8 个一批提速
  const BATCH = 8
  for (let i = 0; i < SOCIAL_PLATFORMS.length; i += BATCH) {
    const group = SOCIAL_PLATFORMS.slice(i, i + BATCH)
    const results = await Promise.all(
      group.map((p) => raw({ url: p[1].replace('%s', username), method: 'HEAD' }))
    )
    for (let j = 0; j < group.length; j++) {
      if (isOk(results[j].statusCode)) {
        hits.push({
          platform: group[j][0],
          category: group[j][2],
          url: group[j][1].replace('%s', username),
          username,
        })
      }
    }
  }
  return { state: 'ok', data: { hits } }
}

// ============================================================
// 订阅消息上报（仅代理模式有意义：下发必须由后端服务器调用微信 API）
// ============================================================

export function subscribeReport(payload: {
  templateId: string
  action: 'accept' | 'reject' | 'ban'
  scenes: string[]
}): Promise<ApiResult<{ ok: boolean }>> {
  if (!backendReady()) {
    return Promise.resolve({ state: 'pending', message: 'backend_not_configured' })
  }
  return viaProxy<{ ok: boolean }>('/subscribe', 'POST', payload as unknown as Record<string, unknown>)
}

/** 把 ApiResult 折算成三源卡片用的 SourceStatus */
export function toSourceStatus<T>(
  res: ApiResult<T>,
  summarize: (d: T) => { summary: string; risk: 'clean' | 'hit' }
): SourceStatus {
  if (res.state !== 'ok' || !res.data) {
    return { state: res.state, summary: undefined, risk: 'unknown' }
  }
  const s = summarize(res.data)
  return { state: 'ok', summary: s.summary, risk: s.risk }
}
