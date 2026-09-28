# 来马通 · Malaysian OSINT 微信小程序

马来西亚开源情报（OSINT）查询工具的微信小程序重制版，基于 [MalaysianOSINTAPP](https://github.com/ctkqiang/MalaysianOSINTAPP)（Kotlin/Compose 原版）1:1 移植接口逻辑，采用「丹青鉴」设计语言（传统色 Token、宣纸/夜墨双主题、界格卡片、风险印章）。

> ⚠️ 本项目仅聚合**公开数据源**，结果仅供参考，不构成法律、投资或其他专业意见。使用者须自行确保查询行为符合当地法律法规。

## 功能一览

| 模块 | 页面 | 数据源 | 说明 |
|---|---|---|---|
| 反诈查询 | `pages/index` | PDRM Semak Mule | 手机号/银行账号/注册号风险核验，命中明细界格表 |
| 身份证综合查询 | `pages/identity` | SSPI 移民局 + 通缉名单 + SPRM | 12 位 MyKad 三源并发核验（出生日期/州属推导 + 三源状态） |
| 企业查询 | `pages/company` | MalaysiaYP 黄页 | SSM 注册号格式校验 + 黄页名称/类别/地址 |
| 社交账号枚举 | `pages/social` | 60+ 公开平台 | 用户名逐平台 HEAD 探测（对齐原版 SocialPlatforms 清单） |
| 电子法庭 | `pages/court` | e-Judgment (kehakiman) | 判决关键词检索，案号/法院徽章/当事人/日期解析，累加翻页，文书直链复制 |
| 设置 | `pages/settings` | — | 主题（宣纸/夜墨/随系统）、三语（中/英/马来）、BNM 警示订阅消息开关、免责声明重置 |

- **BNM 消费者警示名单**：首页直拉 Bank Negara Malaysia 官网名单表格。
- **订阅消息推送**：小程序端不能自主推送，采用微信官方「订阅消息」——设置页开启开关后申请订阅授权并上报后端（`utils/push.ts`），由后端 watcher 在 BNM 新增条目时下发。
- **查询历史**：本地存储，按类型限量保留（`utils/history.ts`）。

## 技术栈

- 微信小程序原生框架（Skyline 渲染）+ TypeScript + Less
- 无第三方运行时依赖（HTML 解析为自写轻量实现，替代原版 Jsoup）
- 类型环境：`miniprogram-api-typings`（vendored 于 `typings/`，含新版 API 补充声明）

## 快速开始

1. 微信开发者工具导入本项目根目录（AppID 用自己的即可）。
2. **直连调试必做**：详情 → 本地设置 → 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。
   - `semakmule.rmp.gov.my` 服务端证书链缺中间证书（原版 Kotlin 用 trust-all 绕过，小程序不可绕过），该勾选可同时豁免证书校验。
3. 真机调试：重新发起「真机调试」扫码（开关随调试会话下发）；预览需在手机端开启开发调试。
4. 编译校验：`npx tsc --noEmit`（应零报错）。

> 代码规范红线：真机运行环境不做 ES6→ES5 降级，**禁止使用 `?.` 与 `??` 语法**（会触发 `SyntaxError: Unexpected token`），空值兜底一律用 `||` / 显式判断。

## 双模式架构（`miniprogram/utils/api.ts`）

| 模式 | 条件 | 用途 |
|---|---|---|
| 直连模式（默认） | `BASE_URL = ''` | 开发调试：与原版 Android 完全一致，直接请求政府公开接口 |
| 代理模式 | `BASE_URL = 'https://你的域名'` | **正式发布必须**：小程序合法域名白名单只收自有备案域名，政府 `.gov.my` 域名无法登记 |

代理后端接口契约（REST + JSON，转发逻辑照抄原版 Repository 即可）：

```
POST {BASE}/semakmule   {query}              → {count, table_data: string[][]}
GET  {BASE}/bnm         ?page=1              → {count, entries: [{name,website,date}]}
POST {BASE}/identity    {ic}                 → {sspi:{statusCode}, wanted:[...], sprm:[...]}
GET  {BASE}/company     ?q=ssmNo             → {name,category,address,website}
POST {BASE}/ecourt      {search,currPage}    → {totalRecord, items:[...]}
POST {BASE}/social      {username}           → {hits:[{platform,url,username}]}
POST {BASE}/subscribe   {templateId,action,scenes} → {ok:true}
```

推送启用：在微信公众平台「订阅消息」申请模板，把模板 ID 填入 `utils/push.ts` 的 `BNM_TEMPLATE_ID`。

## 目录结构

```
├── miniprogram/
│   ├── app.ts|json|less          # 入口：主题初始化、页面注册
│   ├── styles/                   # theme.less（传统色 Token）+ shared.less（界格/卡片）
│   ├── components/               # dj-nav 题字顶栏 · dj-stamp 风险印章 · dj-ink 水墨加载 · dj-tabbar 五项导航
│   ├── pages/                    # index / identity / company / social / court / settings
│   └── utils/
│       ├── api.ts                # 统一 API 层（直连/代理双模式，1:1 移植 Kotlin）
│       ├── models.ts             # 数据模型与类型
│       ├── parsers.ts            # MyKad 推导 / SSM 号校验 / HTML 清洗
│       ├── i18n.ts               # 中/英/马来三语字库
│       ├── settings.ts           # 主题/语言/免责声明持久化
│       ├── history.ts            # 本地查询历史
│       └── push.ts               # 订阅消息（申请/开关/上报）
├── typings/                      # 微信 API 类型定义（含 modern 补充）
└── project.config.json           # 开发者工具配置（TS+Less 编译插件）
```

## 已知数据源特性（判定逻辑依据）

- **Semak Mule 的 `count` 字段不可信**：对任意关键词（含乱码）返回递增数字而 `table_data` 为空——它是 DataTables 分页总数而非命中数。命中判定只看实际返回行数；空返回既非命中也非清白（实时明细需有效验证码），结论显示「无法判定」而非「清白」。
- **e-Judgment 响应较慢**（实测约 9s/页 20 条），API 层内置 20s 超时 + 3 次重试（对齐原版）。
- **.NET `/Date(ms)/` 时间戳**已在 `foldECourt` 统一解析为 `YYYY-MM-DD`；全零 GUID 视为无判决书文书。

## 与原版差异

| 项 | 原版 Android | 小程序版 |
|---|---|---|
| 网络层 | Retrofit + trust-all SSL | `wx.request`（调试期靠工具豁免证书） |
| HTML 解析 | Jsoup | 自写轻量正则/块提取 |
| 社交探测 | OkHttp HEAD ×60 | 8 并发分批 HEAD |
| 推送 | WorkManager 轮询 + 本地通知 | 订阅消息（前端授权上报，下发需后端） |
| 主题 | Compose Material | 传统色 CSS Token（宣纸/夜墨） |

## License

数据版权归各官方来源（PDRM / IMI / SPRM / BNM / Judiciary Malaysia）所有；本项目代码遵循原仓库开源协议。
