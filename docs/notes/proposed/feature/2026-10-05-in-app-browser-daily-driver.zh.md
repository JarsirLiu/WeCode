# Agent Note: 应用内浏览器升级为日常浏览器

Status: proposed

[English](2026-10-05-in-app-browser-daily-driver.md) | 中文

## Problem

应用内浏览器目前是一个「给 agent 用的可观察面板」,不是一个「用户能每天用来浏览的浏览器」。它有意只保留了导航与观察能力:地址栏、前进/后退/刷新、响应式视口、元素拾取、外部打开、DevTools,没有下载入口、没有 tab 条、没有历史记录、没有书签、没有权限提示、没有设置面板,也没有扩展。

与此同时,产品上存在一个明确的需求:让 AI 在用户**已经登录**的站点上替他做事。要满足这个需求,浏览器必须携带用户的真实登录态。当前应用内浏览器使用独立的 `persist:zcode-embedded-browser` partition,是一个与用户日常浏览器完全隔离的空白 profile —— agent 每次都要从零开始登录,用户也感觉不到「这就是我能用的浏览器」。

两个需求叠在一起,形成一个必须回答的问题:**应用内浏览器能不能既具备日常浏览器的完整体验,又携带用户的真实登录态,并且让用户用得跟用别的浏览器一样自然?**

本 note 论证答案是「可以,但有一处必须显式决策的架构取舍」,并给出阶段划分、代码索引与不可行清单。

## Proposal

把应用内浏览器从「agent 观察面板」升级为「用户日常浏览器」,分四个阶段推进,核心设计决策是**复用登录态与隔离凭据不可兼得,必须选择前者并以外层权限矩阵补偿**。

### 阶段划分

| 阶段 | 内容 | 前置 | 量级 |
|---|---|---|---|
| P1 | 登录态自然化:consent 流程、可重复同步、应用内首次登录 | 无(原语已具备) | 2-4 周 |
| P2 | 浏览器壳层:下载条与保存目录、真 tab 条与重启恢复、右键菜单、权限提示、历史记录(区分来源)、打印/存 PDF、设置项扩展 | P1 的分区语义已定 | 6-12 周 |
| P3 | 权限与确认层:per-site × per-动作权限矩阵、审批模式、历史访问审批门 | 与 P1 同批 | 4-8 周 |
| P4 | 扩展迁移:从用户 profile 复制已装扩展并用 `session.loadExtension` 装载 | P1/P2 完成 | 6-10 周 |

P3 不是独立阶段,是 P1 的强制配套 —— 详见 Risks。

### 核心设计决策:单一 session,权限分层

登录态复用的唯一可行路径是把凭据写进 `persist:zcode-embedded-browser`,而这个 partition 同时是 agent 通过 CDP 控制的那个 session。这两个事实一旦同时成立,就产生一条硬约束:

> 一旦导入用户真实登录态,**任何被访问页面的 prompt injection 都会从「AI 被误导做事」升级为「凭据外泄」**。

这条约束不能用「两个 partition 隔离人和 agent」来解 —— Chromium 的 partition 之间 cookie 不可跨,那样 agent 永远拿不到登录态,复用这件事直接归零。

因此设计选择是:**保持单一 session,把收窄手段放在外层权限矩阵**。agent 对每个站点、每个动作类别的可见性与可操作性由矩阵决定,而不是全局开关:

```
persist:zcode-embedded-browser  (单一 partition,人和 agent 共享)
  ├─ 登录态来源:① 从用户 Chrome 导入 ② 应用内首次登录写入
  ├─ agent 访问路径:CDP（observe / interact / full 三档）
  └─ 权限矩阵:per-site × per-动作类别
       动作类别:浏览 / 下载 / 上传 / 代操作 / CDP 直读
       取值:allowed / denied / alwaysAllowed / approvalRequired
```

审批模式全局可配(`alwaysAsk` / `neverAsk` / 企业策略托管),历史访问单独设门,CDP 全权访问作为带高风险标签的显式开关。

### 登录态自然化的三条来源

1. **导入**:走已有的 `discoverChromeProfile` → master key 读取 → `importChromeCookies` 链路,写进现有 partition。这是起点最高的一块 —— 三个平台的解密原语已经写完。
2. **应用内首次登录**:对没有导入的站点,在 guest 内渲染登录页让用户登录一次,session 自然落在 partition 里,此后重启仍有效。
3. **重新同步**:cookie 是带生命周期的快照,用户可能在别处登出或轮换。导入必须是可重复动作,不是一次性迁移,并提供可选的周期刷新。

### 浏览器厂商覆盖

现状:代码里的 `ChromeBrowserKind` 只含 Google Chrome 各通道与 Chromium(`chrome`、`chrome-beta`、`chrome-dev`、`chrome-canary`、`chrome-for-testing`、`chromium`),**不含 Edge、Brave、Opera、Vivaldi**。

因此 P1 的范围需要被诚实界定:本期只覆盖 Google Chrome。用户默认浏览器是 Edge 时,本期导入不会对他生效。

边界原则(本提案只定原则,不展开实现):cookie 数据库格式在 Chromium 家族内原理上兼容,但加密主键的获取方式与密码存储位置按厂商不同,逐厂商实现。发现层必须按「浏览器类型」枚举而不假定单一厂商,使后续扩展成为独立范围项,而不是改动导入管线本身。

### 明确不做

- **Chrome 应用商店分发**。Electron 41 官方声明 `.crx` 不可加载,只能装解包目录。用户无法在应用内安装商店扩展。
- **完整 MV3 支持**。MV3 background service worker 不在 Electron 支持清单内,`chrome.storage.sync` 明确不支持。扩展迁移注定是「能跑就跑,跑不起来的给具体失败原因」。
- **Chrome Sync 级跨设备同步**。需要自建账号体系与同步基础设施,不是产品层能补的缺口。
- **系统默认浏览器**。品牌与用户习惯问题,非技术可解。

## Affected surfaces

### 新增(全部为新文件)

- `packages/shared/src/validationAppSettings.ts` + `protocol.ts` —— 下载目录、默认搜索、主页、清理范围、权限矩阵、审批模式等新设置字段
- `packages/ui/src/browser/` —— 下载条、tab 条、历史页、权限矩阵 UI、右键菜单
- `packages/desktop/src/main/browserData/` —— 登录态导入管线产品化(consent、进度、失败原因分类、可重复同步)
- `packages/desktop/src/main/browserPermissions/` —— per-site 权限矩阵与审批门
- `docs/specs/features/in-app-browser.md` —— 落地时的特性 spec(见 Acceptance criteria)

### 需要修改

- `packages/shared/src/browser-use/command-metadata.ts:72` —— `browserCommandMethodSchema` 增加权限相关命令
- `packages/ui/src/EmbeddedBrowserPaneParts.tsx:44` —— `BrowserToolbar` 增加下载、历史、设置入口
- `packages/desktop/src/main/browserView/browserGuestManager.ts` —— **只许净减行**,见 Risks
- `packages/desktop/src/main/desktopBrowserViewIpc.ts` —— 新增权限/下载 IPC 通道
- `architecture-policy.yaml:49` —— 需要为浏览器子系统补模块边界,见 Risks

### 已具备、无需改动

- 渲染:`<webview>` + 独立持久 partition 已工作
- agent 控制面:CDP attach 与 50 条命令已通
- 人机共享 tab:`claimTab` / `markDeliverable` / `markHandoff` / `listUserTabs` 已存在,与业界同类设计同构
- 登录态解密原语:三个平台的 profile 发现与 cookie 解密全部就绪
- tab shell 持久化:`BrowserTabRecoveryStore` 已存在,可支撑重启恢复

## Code index

本节是审查与实施方案的入口。按「现在代码在哪」组织,不按字母序。所有行号以当前分支为准。

### A. 浏览器怎么嵌进来的

| 位置 | 内容 |
|---|---|
| `packages/ui/src/browser-use/BrowserViewportSurface.tsx:146` | `<webview>` 节点本体,`partition="persist:zcode-embedded-browser"`, `allowpopups`, `nodeintegrationinsubframes="true"`, `key={webviewGeneration}` 受控重建 |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:37-48` | 架构注释:CDP-on-guest,以及**为什么从 `WebContentsView` 改回 `<webview>`**(原生层会遮挡 DOM 浮层) |
| `packages/ui/src/browser-use/HumanBrowserView.tsx:29` | human 分支,视口偏好持久化到 settings |
| `packages/ui/src/browser-use/BrowserViewportToolbar.tsx:42` | 响应式视口工具条(W×H + 缩放) |
| `packages/ui/src/browser-use/BrowserUseSidePaneContent.tsx:76` | agent 分支挂载点 |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx:1267` | 侧边面板挂载点 |
| `packages/ui/src/EmbeddedBrowserPaneParts.tsx:44` | `BrowserToolbar`:前进/后退/刷新/地址栏/视口/元素拾取/更多菜单 —— **当前全部 chrome 面** |
| `packages/desktop/src/main/desktopWindowChrome.ts:583-660` | 宿主窗口 `webviewTag` 开关与 `will-attach-webview` |
| `packages/desktop/src/main/desktopWindowChrome.ts:651-657` | guest webPreferences:`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` |
| `packages/desktop/src/main/desktopWindowChrome.ts:374-448` | `setWindowOpenHandler`:popup 路由(内部新 tab / 外部打开 / deny) |
| `packages/desktop/src/main/desktopWindowChrome.ts:450-479` | `will-navigate` guard |
| `packages/desktop/src/main/embeddedBrowserJavaScriptDialog.ts:3` | `DEFAULT_AUTOMATION_GRACE_MS = 3_000`,alert/confirm 处理 |

### B. guest 上报与 CDP attach

| 位置 | 内容 |
|---|---|
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:445-455` | `did-attach` → 上报 `webContentsId` 给 main |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:301-367` | `reportBrowserGuest`:带 scope 指纹去重、owner 重绑重试 |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:642-656` | webview 事件接线(did-attach / dom-ready / did-navigate / did-fail-load / render-process-gone) |
| `packages/desktop/src/main/desktopBrowserViewIpc.ts:67-260` | 全部 BrowserView IPC handler |
| `packages/desktop/src/host/browserControlMainBridge.ts:1` | host ↔ main 桥注释 |
| `packages/desktop/src/host/index.ts:231` | 桥注册处 |
| `packages/desktop/src/main/desktopHostProcess.ts:432` | main 侧执行入口 |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:696-699` | `guest.debugger.attach("1.3")` |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3444-3512` | CDP `sendCommand` 直通层 |
| `packages/desktop/src/main/browserView/browserCommandTypes.ts:22` | 直通注释:`sessionId` 用于跨进程 iframe(OOPIF) |

### C. agent 控制面

| 位置 | 内容 |
|---|---|
| `packages/shared/src/browser-use/command-metadata.ts:72-122` | `browserCommandMethodSchema`,50 条命令 |
| `packages/shared/src/browser-use/commands.ts:481-484` | `evaluate` —— 在页面作用域执行 JS,**可读取 `document.cookie`** |
| `packages/shared/src/browser-use/commands.ts:520` | `playwright` —— 任意 Playwright 调用 |
| `packages/shared/src/browser-use/commands.ts:490` | `getDialog` |
| `packages/shared/src/browser-use/commands.ts:530` | `browserViewportSet` |
| `packages/desktop/src/main/browserView/browserCommandPageHandlers.ts:170/237/308/332` | navigate / screenshot / snapshot / evaluate |
| `packages/desktop/src/main/browserView/browserCommandInteractionHandlers.ts` | click / type / scroll / drag / hover |
| `packages/desktop/src/main/browserView/browserCommandScripts.ts` | 注入 guest 的脚本 |
| `packages/desktop/src/main/browserView/browserPlaywrightLocatorExecutor.ts` | Playwright locator 执行器 |

### D. 人机共享 tab(已存在的同构设计)

| 位置 | 内容 |
|---|---|
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1173-1195` | `claimTab`:agent 认领用户的 tab |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1335-1341` | `markDeliverable` / `markHandoff`:标记产出 / 交还人类 |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:1018-1055` | `executeInScope`:scope 隔离的命令分发 |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:409-414` | 影响 tab 生命周期的命令集合 |
| `packages/ui/src/browser-use/UnifiedBrowserView.tsx:106-108` | `browserUseOperationUntil`:agent 操作期间与用户共享的操作截止时间 |

### E. 登录态导入原语(P1 的起点,已全部就绪)

| 位置 | 内容 |
|---|---|
| `packages/desktop/src/main/browserDataManager.ts:30` | `EMBEDDED_BROWSER_PARTITION = "persist:zcode-embedded-browser"` —— 唯一分区常量 |
| `packages/desktop/src/main/browserDataManager.ts:73` | `importChromeBrowserData`:导入编排 |
| `packages/desktop/src/main/browserDataManager.ts:210` | `clearEmbeddedBrowserData`:可逆出口 |
| `packages/desktop/src/main/browserDataManager.ts:123` / `:216` | `session.fromPartition(EMBEDDED_BROWSER_PARTITION)` |
| `packages/desktop/src/main/chromeCookieManager.ts:409` | `importChromeCookies`:cookie 写入 |
| `packages/desktop/src/main/chromeCredentialManager.ts:66` | `readWindowsChromeMasterKey`:Windows DPAPI |
| `packages/desktop/src/main/chromeCredentialManager.ts:51` | `readMacChromeSafeStorageSecret`:macOS Keychain |
| `packages/desktop/src/main/chromeCredentialManager.ts:14` | `ChromeCookieAccessDeniedError` |
| `packages/desktop/src/main/chromeProfileDiscovery.ts:219` | `discoverChromeProfile`,返回 `ChromeBrowserKind` |
| `packages/desktop/src/main/chromeInstallationCandidates.ts:23` | **`ChromeBrowserKind` = chrome / chrome-beta / chrome-dev / chrome-canary / chrome-for-testing / chromium —— 不含 Edge、Brave、Opera、Vivaldi** |
| `packages/desktop/src/main/chrome-*.ts` | 现有 7 个模块:cookie manager / cookie mapping / credential manager / executable discovery / installation candidates / local storage manager / profile discovery |
| `packages/desktop/src/main/chromeLocalStorageManager.ts:394-421` | `runChromeHelper`:**启动真实 Chrome 进程**(`--headless=new`、`--disable-extensions`、`--remote-debugging-port=0`),用 WebSocket CDP 连入 —— 证明本仓已跑通过「CDP 消费真 Chrome」 |
| `packages/desktop/src/main/chromeLocalStorageManager.ts:562` | `Storage.getCookies`:**仅此一处**,位于导入路径,用于读用户 cookie。**不在应用内 guest 的控制面上** |
| `packages/desktop/src/main/desktopNetworkPolicy.ts:66` | 同一 partition 上的网络策略 |

### F. 下载:只有跟踪,没有呈现

| 位置 | 内容 |
|---|---|
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3350-3381` | `setupDownloadTracking`:`guest.session.on("will-download")`,记录 `{tabId, path, state}` |
| `packages/desktop/src/main/browserView/browserGuestManager.ts:3991-4002` | `refreshRuntimeProtection`:下载中 tab 免于 residency 驱逐 |
| —— | **全仓无 `setSavePath` / `setDownloadPath` / `defaultDownloadDirectory` 调用**,即无保存对话框、无下载 UI、无下载目录设置 |

### G. tab 生命周期、恢复与驱逐

| 位置 | 内容 |
|---|---|
| `packages/desktop/src/main/browserView/browserTabRecoveryStore.ts:66` | `BrowserTabRecoveryStore`:tab shell 持久化 |
| `packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts:1` | `BROWSER_TAB_LIMIT = 32` |
| `packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts:56` | `selectBrowserTabLimitVictim`:驱逐策略 |
| `packages/desktop/src/main/browserView/browserTabResidencyCoordinator.ts` | 驱逐/挂起协调 |
| `packages/desktop/src/main/browserView/browserRestoreBootstrapProtocol.ts` | 恢复 bootstrap 协议 |
| `packages/desktop/src/main/browserView/browserScreenshot*.ts` | 截图与录制 |

**注意**:P2 要把默认语义从「可驱逐」翻成「不可驱逐」—— 日常浏览器不能杀用户的 tab。

### H. 设置面(现状很薄)

| 位置 | 内容 |
|---|---|
| `packages/shared/src/validationAppSettings.ts:432-433` | 现有浏览器设置**只有两个字段**:`embeddedBrowserAllowInsecureCertificates`、`embeddedBrowserViewportPreference` |
| `packages/ui/src/settings/BrowserSettingsSection.tsx` | 设置页:Chrome 数据导入/清理、不安全证书开关、Browser 插件开关 |
| `packages/ui/src/settings/BrowserSettingsSection.tsx:30` | `OFFICIAL_BROWSER_USE_PLUGIN_ID` —— 此处的「插件」指 ZCode 应用插件,**不是浏览器扩展** |
| `packages/ui/src/settings/BrowserSettingsSection.tsx:81-110` | `BrowserDataOperation`:import / clear-cache / clear-all |

### I. 缺口清单(grep 零命中的能力)

| 能力 | 现状 |
|---|---|
| `session.setPermissionRequestHandler` | **零命中** —— 无权限提示(相机/麦克风/定位/通知/弹窗) |
| guest 级右键菜单 | **零命中** —— `desktopWindowChrome.ts:721` 是窗口菜单,不是页面菜单 |
| 下载 UI / 保存目录 | 见 F 节 |
| 历史记录 | 无持久化记录(每个 tab 有 `sessionId`/`workspaceKey`,归因来源免费可得) |
| 扩展装载 | `session.loadExtension` **零命中**;唯一 `--disable-extensions` 在 `chromeLocalStorageManager.ts:398`,用于隔离外部 Chrome |
| 密码管理 | 仅导入路径读取(`windowsChromeAppBoundKey.ts`、`MacChromeSafeStorageSecretReader`),无管理器 UI |
| 非 Google 厂商浏览器(Edge / Brave / Opera / Vivaldi) | **未覆盖** —— `ChromeBrowserKind` 无对应枚举,见 Proposal「浏览器厂商覆盖」 |

### J. 仓库约束(实施前必读)

| 位置 | 约束 |
|---|---|
| `.file-size-baseline.json:109` | `browserGuestManager.ts` 冻结上限 **4067 有效行**(当前 4639 原始行) |
| `docs/specs/file-size-ratchet.md` | 规则:已登记文件**只许减不许增**;>1500 行的巨型文件本次触碰**必须净减行** |
| `AGENTS.md` | spec-first;note 英文/中文成对;新增行为先补 spec;非平凡改动需 note |
| `architecture-policy.yaml:49` | `packages/desktop/src` 是单一 unmanaged root,**浏览器子系统无任何模块边界声明** |
| `scripts/check-workspace-freshness.mjs` | 开工前基线检查 |

**推论**:P1-P4 全部必须是新文件。不能向 `browserGuestManager.ts` 追加。这一约束与本提案天然契合 —— 每个阶段都落在新目录。

### K. 外部参考(证据,非本仓代码)

以下结论来自对第三方应用的本地只读勘察,用于论证可行性,不作为本仓代码引用:

| 事实 | 来源 |
|---|---|
| 同类 Electron 桌面端已实现 **310 个** `settings.browserUse.*` i18n 键:下载管理(含 `pause`/`resume`)、下载目录设置、浏览历史(带分页与搜索)、清数据(时间范围 + 分项)、站点权限矩阵、自动填充与密码、显示完整 URL、开发者模式 | 其 `app.asar` 字符串 |
| 站点权限矩阵列:`browsingColumn` / `downloadsColumn` / `uploadsColumn` / `actionsColumn` / `cdpAccess`;取值 `allowed` / `denied` / `alwaysAllowed` / `approvalRequired` | 同上 |
| **历史记录区分 `source.agent` 与 `source.other`** —— AI 浏览器特有设计 | 同上 |
| `fullCdp` 作为带 `elevatedRisk.label` 的显式开关,且可被企业策略阻断 | 同上 |
| `historyApproval`:agent 访问历史需审批(`alwaysAsk` / `neverAsk` / `managedDescription`) | 同上 |
| `profileImport.extensions*` 一整条扩展迁移管线,含 14 种失败码(`extensionUnsupportedPermissions`、`extensionBlockedByPolicy`、`extensionChromeComponent`、`extensionProfileClosed` 等) | 同上 |
| `windowsChrome.consent`:读取 Windows Chrome 数据前的单独 consent | 同上 |
| 其 iab 后端与 extension 后端并存,通过 `agent.browsers.list()` 的 `metadata.codexSessionId` / `metadata.extensionInstanceId` 区分 | 其插件文档 |

### L. 平台限制(官方文档原文)

| 限制 | 出处 |
|---|---|
| "Electron only supports loading unpacked extensions (i.e., .crx files do not work)" | `node_modules/electron/electron.d.ts:8305`(Electron 41.0.3) |
| `loadExtension` 每次启动必须调用,不落盘 | `node_modules/electron/electron.d.ts:8300-8303` |
| in-memory session 不支持加载扩展 | `node_modules/electron/electron.d.ts:8310-8311` |
| "Electron does not support the full range of Chrome extensions APIs" | `node_modules/electron/electron.d.ts:8297-8298` |
| `chrome.storage.sync` / `chrome.storage.managed` 不支持 | Electron Extensions API 文档 |
| MV3 background service worker 不在支持清单内 | 同上(支持清单仅列 MV2 `background` key) |

## Alternatives considered

**方案 A:双 partition 隔离(人一个、agent 一个)。否决。** 这是「安全」的直观答案,但在技术上直接摧毁了目标。Chromium 的 partition 之间 cookie 不可跨,agent 永远拿不到登录态,「复用用户登录态」这个命题归零。我们是在为复用登录态而建这个浏览器,不能一边建一边否定。

**方案 B:不内置浏览器,只外挂用户已装的 Chrome(浏览器扩展 + Native Messaging)。否决作为主路径。** 技术上最省事,且本仓已具备前置能力(`runChromeHelper` 已跑通过 WebSocket CDP 连真 Chrome)。但它拿不到「同一个窗口里人机协同」的体验,而这正是本产品的差异化位置。可保留为 P4 之后的可选补充路径,不做本期范围。

**方案 C:复用登录态,但把 agent 的 cookie 读取能力完全关掉(只留 DOM 级 observe)。部分否决。** 这确实是最保守的安全姿态,但代价是 agent 无法完成大量真实任务(读登录态页面内容、走已登录流程)。而且 `evaluate` 已可读取 `document.cookie`,只关 CDP 的 `Storage` 域并不能真正收窄 —— 收窄必须落在动作层面(per-site 权限矩阵),而不是传输层面。

**方案 D:自建同步服务 + 自建密码管理器。否决本期。** 自建账号级云同步是基础设施级投入,不是产品层能补的缺口;自建密码管理器意味着承担新的安全责任面。两者都不在本期范围。

## Acceptance criteria

1. `docs/specs/features/in-app-browser.md` 落地,明确三件事:登录态复用的范围与边界、per-site 权限矩阵的字段 schema、P4 及「明确不做」清单的理由。
2. P1 可回放测试:用夹具 Chrome profile 走完 consent → 导入 → 打开已登录站点成功,不依赖真实用户数据,CI 无密钥可跑。
3. 权限矩阵有明确的默认值(默认 `approvalRequired`),且默认值在 spec 里写死,不靠代码隐式约定。
4. 清数据路径可逆:导入后能通过 `clearEmbeddedBrowserData` 完全清除,并有测试覆盖。
5. 本提案对应的本 PR 需通过 `pnpm typecheck`、`pnpm lint`、`pnpm size:check`、`pnpm architecture:check --changed`、`pnpm docs:check`。
6. 发现层的浏览器枚举不写死单一厂商,使「支持下一个浏览器」成为独立范围项,而不是重新设计 P1 的导入管线。
7. 新增代码全部落在新文件,`browserGuestManager.ts` 净减行数(若触碰)。

## Risks

- **凭据外泄是最主要的已知风险,且是本次提案主动选择接受的。** 导入真实登录态后,agent 通过 `evaluate` 可读取非 HttpOnly cookie,通过 CDP 直通层可尝试 `Storage.getCookies`(当前此调用只存在于导入路径 `chromeLocalStorageManager.ts:562`,但 `sendCommand` 直通层 `browserGuestManager.ts:3444-3512` 在技术上可达)。P3 的权限矩阵不是可选项,是 P1 的强制配套。
- **`browserGuestManager.ts` 已冻结在 4067 有效行,当前 4639 原始行。** 任何向该文件追加的代码都会被 `pnpm size:check` 拦下。所有新职责必须进新文件,拆分该文件需另立任务。
- **浏览器子系统不在架构门禁管辖内。** `architecture-policy.yaml:49` 把 `packages/desktop/src` 声明为单一 unmanaged root,没有 browserView 模块、没有层划分、没有 publicEntrypoints。这是现状治理缺口,不是本期引入的问题;但 P1 引入 `browserData/`、P3 引入 `browserPermissions/` 会扩大这个缺口的面。建议在 P1 同批补上模块边界声明。
- **产品定位风险:日常浏览入口已被 Chrome/Edge/Safari 锁死。** 用户不会把 coding IDE 的内置浏览器设为默认浏览器。本提案的目标是「干活时手边有个够用的浏览器」,不是「替代日常浏览器」。这个边界必须在 spec 里写清楚,否则 P2 会无限膨胀。
- **P1 只覆盖 Google Chrome,这是本期真实的范围边界,不能含糊过去。** 现有 7 个 `chrome-*.ts` 模块构成的导入管线没有 Edge、Brave、Opera、Vivaldi 分支。用户在 spec 审阅时应被告知:默认浏览器是 Edge 的话,本期导入对他不生效。
- **扩展到其他 Chromium 厂商的成本没有在本期摊销。** cookie 数据库格式在家族内原理上兼容,但加密主键的获取与密码存储位置按厂商不同。每新增一个厂商都要独立的密钥读取实现与回归测试,不能当成「换个路径」处理。
- **P4 的收益递减。** 扩展迁移注定是「能跑就跑」,约一半的工作量是失败码而非成功路径。建议在 P1/P2 交付后再重新评估是否立项。
- **本提案的可行性论证基于对第三方应用的本地只读勘察(见 K 节),非本仓代码。** 那些结论证明「有团队用同样的 Electron 做到过」,但不构成对本仓的实施保证。
- **本提案在实现前不改变任何行为。** Status 为 proposed,不进入实现门禁。
