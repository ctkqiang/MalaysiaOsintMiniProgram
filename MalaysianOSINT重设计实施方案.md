# 「丹青鉴」— MalaysianOSINT 重设计实施方案

> 基于开源项目 [ctkqiang/MalaysianOSINTAPP](https://github.com/ctkqiang/MalaysianOSINTAPP) 的全新 Android 应用
> 方案版本 v1.0 · 2026-09-28 · 哪吒网络安全·钟智强
> **状态：待审批 — 批准前不编写任何应用代码**

---

## 第一阶段 · 源码分析摘要

### 1.1 项目概况

| 项 | 内容 |
|---|---|
| 技术栈 | Kotlin + Jetpack Compose + Material3, MVVM |
| 网络 | Retrofit2 + OkHttp4 (Scalars/Gson 双转换器) |
| 解析 | Jsoup (HTML 抓取) + Gson (JSON) |
| 持久化 | DataStore Preferences (设置) + SQLiteOpenHelper (历史/任务/快照，刻意不用 Room) |
| 后台 | WorkManager (BNM 周期轮询) + 应用级 CoroutineScope (查询任务) |
| 构建 | Gradle 9.x / AGP 8.7 / Kotlin 2.0, compileSdk 35, minSdk 26 |
| 规模 | 24 个 Kotlin 文件，约 5,300 行，单 `:app` 模块 |

### 1.2 功能模块与数据来源

| 模块 | 数据源 | 方式 | 关键逻辑 |
|---|---|---|---|
| 反诈骗查询 | PDRM Semak Mule (`semakmule.rmp.gov.my`) | POST JSON，内嵌 apikey + Origin/Referer 头 | 返回 `count` + `table_data` 二维表 |
| 身份证综合查询 | SSPI 移民局 + PDRM 通缉名单 + SPRM 反贪会 | 表单 POST / HTML 抓取 | 三源并发 + 本地 MyKad 解析汇总为 `IDCheckResult` |
| MyKad 解析 | 本地 | 纯本地 | 12 位号码 → 出生日期(YYMMDD)、州属代码(16 州枚举)、尾号 |
| SSM 解析 | 本地 | 纯本地 | 12 位注册号第 5-6 位 → 7 类实体类型枚举 |
| 企业查询 | MalaysiaYP 黄页 + Semak Mule 交叉验证 | GET HTML 抓取 | 取首个结果 + 反诈骗联动 |
| 社交枚举 | 60+ 平台 | HEAD 请求逐平台探测 | 命中即流式回调，主线程通知 UI |
| 电子法庭 | e-Court (`ejudgment.kehakiman.gov.my`) ASMX JSON | POST，3 次重试间隔 3s | `d.ListOfSearchItem`，HTML 标签清洗，PDF 走系统浏览器 |
| BNM 警示 | 国家银行 `financial-consumer-alert-list` | GET HTML 表格解析 | 后台周期轮询 + 快照指纹 diff，只通知真正新增条目 |

### 1.3 架构与数据流

```
Screen (Compose) → MainViewModel (StateFlow) → SearchTaskManager (应用级作用域)
                                              → OSINTRepository → ApiClient/Retrofit+Jsoup → 政府公开接口
                              SearchHistoryStore (SQLite)  ← 任务完成后写入
                              BnmUpdateWorker (WorkManager) → BnmAlertWatcher → 快照 diff → 通知
```

值得肯定的设计（新版必须保留）：
- **SearchTaskManager**：查询跑在应用级作用域上，离开页面不中断；完成→落库→通知的顺序保证通知永不早于持久化。
- **BnmAlertWatcher 的"空名单不 diff"原则**：网络失败返回空列表视为"无信息"而非"全部撤销"，防止一次断网触发海量误报。
- **搜索历史 upsert + 分类型裁剪**（每类 20 条 / 全局 200 条）。
- **SettingsViewModel 伴生对象静态读取**：后台 Worker 无 Activity 也能读通知开关与语言。
- **免责声明确认门** + Android 13 通知权限一次性请求。
- 三语支持（中/英/马来）CompositionLocal 下发，屏幕内无硬编码文案。

### 1.4 现有痛点（重构动机）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | **上帝仓库**：8 个数据源、3 套 Retrofit、HTML 解析全部挤在 `OSINTRepository` (367 行) | data/repository | 任何源变动都要动这个类；无法单测 |
| 2 | **上帝 ViewModel**：6 个屏幕共用 `MainViewModel`，单一全局 `isLoading`，状态字段 10+ 个 | viewmodel | 跨模块耦合，一个查询让所有页面都"转圈" |
| 3 | **全局 trust-all SSL**：`ApiClient` 信任一切证书 + 绕过主机名校验 | data/api | 中间人风险，安全工具自身不安全，讽刺且危险 |
| 4 | **无依赖注入**：手动 Factory + 单例 `getInstance` 散落各处 | 全局 | 测试困难，依赖关系隐式 |
| 5 | **单模块巨石**：UI/数据/工具全部在 `:app` | 构建 | 编译慢，无法按模块隔离与复用 |
| 6 | **零测试**：全仓库无一个测试文件 | — | 解析逻辑(MyKad/SSM/SPRM)回归全靠手测 |
| 7 | **UI 组件大杂烩**：622 行 `Components.kt` 平铺所有组件 | ui/components | 定制新视觉语言时无处下手 |
| 8 | Semak Mule apikey 硬编码在接口默认参数中 | OSINTService | 泄露在字节码中（此为复刻官方前端行为，新版沿用但集中管理） |

---

## 第二阶段 · 中国风 UI 重设计 —— 设计语言「丹青鉴」

> 命名释义：**丹青**（中国传统绘画颜料，代指水墨美学）+ **鉴**（明鉴、印鉴，扣合"情报核验"的产品本质）。
> 设计原则：**用中国传统色的克制与留白，衬托风险信号的唯一性**——原版 "Ink & Signal" 的理念保留，但视觉语言完全原创重写。

### 2.1 配色系统（中国传统色）

**浅色模式「宣纸」**

| Token | 色值 | 传统色名 | 用途 |
|---|---|---|---|
| `primary` | `#2B4C7E` | 黛青 | 主色、导航选中、主按钮 |
| `primaryContainer` | `#E3EAF4` | 月白 | 选中底、卡片强调底 |
| `background` | `#F6F3EC` | 宣纸 | 页面背景 |
| `surface` | `#FDFCF8` | 绢本 | 卡片表面 |
| `onSurface` | `#26292E` | 玄墨 | 正文 |
| `onSurfaceVariant` | `#6B6F76` | 淡墨 | 次要文本 |
| `outlineVariant` | `#DDD8CC` | 素纱 | 分隔线/边框 |

**深色模式「夜墨」**

| Token | 色值 | 传统色名 | 用途 |
|---|---|---|---|
| `primary` | `#8FB0DC` | 天青 | 主色 |
| `background` | `#14171C` | 玄夜 | 页面背景 |
| `surface` | `#1D2128` | 墨石 | 卡片 |
| `onSurface` | `#E8E6E0` | 霜白 | 正文 |

**风险语义色（唯一彩色信号，与结构色严格分离）**

| 语义 | 浅色 | 深色 | 传统色名 | 用途 |
|---|---|---|---|---|
| Danger | `#A63A2B` | `#E08072` | 朱砂 | 高风险命中 |
| Warning | `#A8763E` | `#D9AC6A` | 赭石 | 部分命中/注意 |
| Success | `#4E7A51` | `#8FBF92` | 竹青 | 无记录/干净 |
| Info | `#3A6B8C` | `#7FA8C4` | 黛蓝 | 中性提示 |

点缀色：**泥金 `#B08D57`**——仅用于印章描边、里程碑数字等极少数场合，全局出现频率 < 5%。

### 2.2 字体排版

| 层级 | 字体 | 规格 |
|---|---|---|
| 大标题/页面题字 | Noto Serif SC（思源宋体） | 22sp / Medium / 字距 +0.5 |
| 卡片标题 | Noto Serif SC | 16sp / Medium |
| 正文 | Noto Sans SC（思源黑体） | 14sp / Regular |
| 号码/案件号/IC | JetBrains Mono | 13sp，配「界格」背景（仿竹简界栏） |

排版细节：段落行高 1.7（取"疏可走马"之意）；卡片内边距统一 20dp；列表项之间以**回纹演化而来的细线**分隔（0.5dp，非整幅宽，两端各留 16dp 呼应留白）。

### 2.3 中式视觉元素（原创，不照搬原版）

1. **印章系统（核心原创元素）**
   - 风险结论以「印」呈现：高风险盖**朱砂方印**（阳文"警"字），干净盖**竹青圆印**（"清"字），仿金石篆刻的圆润转角。
   - App 图标即一方「鉴」字朱文印，深色底金边。
2. **水墨加载**：查询中以墨滴入水晕开动画替代原版脉冲扫描（半径扩散 + 透明度衰减，Compose `Animatable` 实现，尊重 `prefers-reduced-motion`）。
3. **卷轴转场**：页面级导航用轻微的"展卷"动效（水平位移 8% + 淡入 300ms），克制不炫技。
4. **界格卡片**：结果卡片以细线界格分区，呼应古籍版式；标题区左侧一条 3dp 黛青竖线，如批注界栏。
5. **云纹空态**：空状态用简笔如意云纹 SVG + 单行提示，不用插画照片。
6. **导航**：底部导航 5 项不变（首页/身份/企业/社交/法庭），选中态为黛青胶囊 + 宋体加粗；顶栏题字式 App 名 + 印章式设置入口。

### 2.4 各屏幕重设计要点

| 屏幕 | 原版 | 新设计 |
|---|---|---|
| 首页 | 反诈查询 + BNM 列表 | 顶部「今日鉴」印章徽记 + 查询框（界格输入框）；BNM 名单为卷轴式可展开列表，新增条目带朱砂"新"字角标 |
| 身份证 | 四源结果纵排 | MyKad 信息以「简牍」横条展示出生地/日期；三源核查结果以三枚印鉴横排，点开看详情 |
| 企业 | SSM + 黄页 + 反诈 | SSM 解析结果做成「牌匾」卡；交叉验证结果合并为单一风险结论印章 |
| 社交 | 流式列表 | 按命中顺序逐条"落墨"进场；每条左侧平台首字圆章 |
| 法庭 | 列表 + PDF | 判决书列表用界格表格；文书按钮为「拓片」样式 |
| 设置 | 开关列表 | 分组卡片（雅/俗之辨：主题、语言、通知、关于），每组标题带小篆风格图标 |

### 2.5 无障碍与合规

- 全部语义色深浅模式对比度 ≥ 4.5:1（WCAG AA）。
- 动效全部可关（系统"减弱动画"自动生效）。
- 三语（中/英/马来）文案沿用 CompositionLocal 方案，新增字符串 key 100% 覆盖三语。

---

## 第三阶段 · 架构优化 —— 集中式模块化

### 3.1 总体思路

从「单模块 + 上帝类」改为**多模块 + 单向依赖 + 依赖注入**的集中式架构：所有依赖在 `:app` 层一处装配（Hilt），数据源、用例、UI 模块全部面向接口编程，形成清晰的单向依赖图。

### 3.2 模块划分

```
:app                    # 装配层：Hilt 入口、NavHost、主题装配（唯一知道所有实现的地方）
├── :core:model         # 纯数据模型 + 枚举（无 Android 依赖，可 JVM 单测）
├── :core:common        # Result 封装、调度器Provider、日志门面
├── :core:network       # OkHttp/Retrofit 工厂、按域名信任策略、UA 拦截器
├── :core:database      # SQLiteOpenHelper（历史/任务/BNM快照）+ Store 封装
├── :core:datastore     # 设置持久化
├── :core:designsystem  # 「丹青鉴」主题、Token、印章/界格/云纹组件库
├── :core:data          # Repository 接口 + 各 DataSource 实现 + UseCase
└── :feature:home / :identity / :company / :social / :court / :settings
                        # 每模块自己的 ViewModel + UiState + Screen
```

依赖规则：`feature:* → core:data → core:{network,database,datastore,model}`；`core:designsystem` 只被 feature 与 app 依赖；**任何模块不得依赖 `:app`**。

### 3.3 关键重构点

| # | 重构 | 方案 |
|---|---|---|
| 1 | 拆上帝仓库 | 每数据源一个 `XxxRemoteDataSource`（只管 HTTP + 解析），`OSINTRepository` 变为纯编排接口，组合查询（身份证三源、企业交叉）上提为 UseCase |
| 2 | 拆上帝 ViewModel | 每功能模块独立 ViewModel + 不可变 `UiState`（sealed：Idle/Loading/Success/Failure），加载状态不再全局共享 |
| 3 | DI | Hilt：`@Module` 提供 OkHttp/Retrofit/数据库/仓库，`SearchTaskManager` 从手写单例改为 `@Singleton` 注入 |
| 4 | SSL 收紧 | 移除全局 trust-all，改为**按域名信任管理器**：仅对已知证书异常的政府域名走兼容策略，其余域名严格校验（安全工具自身先安全） |
| 5 | apikey 集中 | Semak Mule apikey 移入 `NetworkConfig` 单点管理，BuildConfig 注入，不再散落接口默认参数 |
| 6 | 类型安全导航 | Navigation Compose 2.8+ 的 type-safe route（Kotlin Serialization） |
| 7 | 测试 | parser（MyKad/SSM/HTML清洗）、DataSource（MockWebServer）、ViewModel（Turbine）三层单测，核心解析覆盖率 ≥ 80% |
| 8 | 保留资产 | SearchTaskManager 作用域模型、BnmAlertWatcher diff 原则、历史裁剪策略、静态设置读取——逻辑原样迁移，仅换注入方式 |

### 3.4 统一数据流（新）

```
Screen(state) ← ViewModel(UiState) ← UseCase ← OSINTRepository(接口)
                    │                                ├─ SemakMuleSource ─┐
                    │                                ├─ SspiSource        ├─ core:network
                    ├─ SearchTaskManager(@Singleton) ├─ WantedSource      │  (域名级SSL策略)
                    └─ SearchHistoryStore            ├─ SprmSource        │
                                                     ├─ ECourtSource      │
                                                     ├─ YellowPagesSource │
                                                     ├─ BnmSource         │
                                                     └─ SocialProbeSource ┘
BnmUpdateWorker(WorkManager) → BnmAlertWatcher → BnmSnapshotStore → 通知
```

---

## 第四阶段 · 分阶段实施计划

> 每个里程碑均为可独立验证的交付物；全程不改变对外功能集（与原版 1.1.0 功能对齐 + 新增测试与安全加固）。

### M0 · 奠基（脚手架与设计系统）
- 建立多模块 Gradle 工程 + Hilt + 版本目录（version catalog）
- `:core:designsystem` 落地「丹青鉴」全部 Token（配色/字体/间距/动效时长）+ 印章、界格、云纹、水墨加载四组基础组件
- CI：GitHub Actions 每次推送跑 `compileDebugKotlin` + lint
- **交付**：可编译的空壳 App（新主题演示页）+ 设计系统组件预览

### M1 · 数据层重构
- 迁移全部模型至 `:core:model`；7 个 RemoteDataSource 逐个从旧仓库剥离
- `:core:network`：域名级 SSL 策略、UA 拦截器、apikey 集中管理
- `:core:database` / `:core:datastore` 原样迁移（逻辑不变）
- MockWebServer + parser 单测全覆盖
- **交付**：数据层可独立编译，单测通过（这是后续一切的地基）

### M2 · 核心功能迁移（首页 / 身份 / 企业）
- 三个 feature 模块各自的 ViewModel + UiState + 新 UI（印章风险结论、简牍 MyKad、牌匾 SSM）
- SearchTaskManager 改造为 Hilt 单例并接入
- **交付**：反诈骗、身份证综合、企业交叉查询三屏可用，历史记录工作正常

### M3 · 其余功能（社交 / 法庭 / 设置）
- 社交流式枚举（落墨动效）、e-Court 重试与 PDF 外开、设置三语/主题/通知开关
- 免责声明门 + 通知权限流程迁移
- **交付**：全部六屏功能与原版对齐

### M4 · 后台与通知
- BnmUpdateWorker + BnmAlertWatcher 迁移，快照 diff 逻辑保持不变
- 通知渠道、任务完成通知、BNM 新增通知（多语言）
- **交付**：后台轮询与通知全链路验证

### M5 · 打磨与加固
- 动效精修（卷轴转场、水墨加载、reduced-motion 适配）
- 无障碍审计（TalkBack 标签、对比度）、ProGuard 规则、release 签名配置
- 深浅双模式全屏走查
- **交付**：候选发布版 APK

### M6 · 发布
- fastlane 元数据（三语商店文案沿用并更新截图）
- 版本 v2.0.0，沿用 tag 触发 CI 发布流程（GitHub + Gitcode 双流水线）
- **交付**：上架包 + Release

### 里程碑依赖与验收

```
M0 → M1 → M2 → M3 → M4 → M5 → M6
        └─(M2/M3 可并行)─┘
```

| 里程碑 | 验收标准 |
|---|---|
| M0 | 空壳 App 新主题可运行；组件预览页齐全 |
| M1 | 数据层单测全绿，parser 覆盖率 ≥ 80% |
| M2/M3 | 六屏功能与原版逐项对齐，历史/任务落库正常 |
| M4 | 断网重连不产生 BNM 误报；通知遵循语言与开关设置 |
| M5 | lint 零 error；对比度 AA；动画可关 |
| M6 | CI 双平台出包成功 |

### 风险与对策

| 风险 | 对策 |
|---|---|
| 政府站点反爬/改版 | 解析逻辑全部隔离在 DataSource，单测快照固定 HTML 样本，改版只改一处 |
| trust-all 移除后个别站点连接失败 | 域名白名单兼容策略保留逃生通道，并记录日志 |
| Compose 自定义动效性能 | 动效仅用 transform/alpha，避免重组风暴；Macrobenchmark 抽查 |
| 三语文案膨胀 | 字符串 key 表先行，M0 即建全量三语对照表 |

---

## 附录：功能拆解总表（开发对照清单）

| 编号 | 功能 | 数据源 | 模块 | 里程碑 |
|---|---|---|---|---|
| F01 | 反诈骗查询（电话/银行账号） | PDRM Semak Mule | feature:home | M2 |
| F02 | BNM 消费者警示列表 | BNM | feature:home | M2 |
| F03 | MyKad 本地解析 | 本地 | feature:identity | M2 |
| F04 | SSPI 移民局状态 | SSPI | feature:identity | M2 |
| F05 | PDRM 通缉名单比对 | RMP | feature:identity | M2 |
| F06 | SPRM 反贪记录 | SPRM | feature:identity | M2 |
| F07 | SSM 注册号解析 | 本地 | feature:company | M2 |
| F08 | 企业黄页搜索 | MalaysiaYP | feature:company | M2 |
| F09 | 企业反诈交叉验证 | PDRM | feature:company | M2 |
| F10 | 社交用户名枚举（60+ 平台） | 各平台 | feature:social | M3 |
| F11 | 电子法庭判决检索 | e-Court | feature:court | M3 |
| F12 | 判决 PDF 打开 | 系统 Intent | feature:court | M3 |
| F13 | 搜索历史（SQLite + 裁剪） | 本地 | core:database | M2 |
| F14 | 查询后台任务 + 完成通知 | 本地 | core:data | M2 |
| F15 | BNM 后台轮询 + 新增通知 | BNM | app/worker | M4 |
| F16 | 设置（主题/语言/通知/翻译） | DataStore | feature:settings | M3 |
| F17 | 免责声明确认门 | DataStore | app | M3 |
| F18 | 三语国际化 | 本地 | core:common | M0 起持续 |

---

*本方案为完整实施蓝图。请审阅后明确批准（或提出修改意见），批准后我将按 M0 → M6 顺序开始开发。*
