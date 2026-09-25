# Agent Note: 捕获内容排除的隐身模式

Status: proposed

[English](2026-09-25-stealth-mode-invisible-capture.md)

## 问题

办公用户经常把 WeCode 与远程会议、屏幕共享和录屏一起使用。应用可能展示对话历史、模型输出和敏感配置，而演示者不希望这些内容进入共享画面。

本功能需要的行为比绝对隐身更具体：在受支持的 Windows 版本上，用户仍可在本地使用 WeCode，同时普通操作系统捕获路径不包含 WeCode 的像素。功能不能声称 WeCode 会从会议软件的窗口选择器中消失，不能阻止所有捕获实现，也不能声称 macOS 和 Linux 具有同等能力。

WeCode 已经有产品内部的截图、浏览器录制和 CUA 就绪探测路径。因此，捕获排除设置必须明确区分外部捕获保护和由 WeCode 主动发起的捕获。

## 提案

在设置的常规区域新增桌面端 `stealthModeEnabled` 开关。启用后，桌面主进程对每个符合条件的 WeCode 顶层窗口调用 Electron 已有的 `BrowserWindow.setContentProtection(true)`；关闭后调用 `setContentProtection(false)`，不要求重启。

在 Windows 10 2004 及更高版本中，Electron 文档说明该 API 会调用 `SetWindowDisplayAffinity` 和 `WDA_EXCLUDEFROMCAPTURE`，在受支持的捕获输出中移除窗口像素。更早版本的 Windows 可能退化为 `WDA_MONITOR`，导致捕获结果出现黑色窗口；这些版本必须显示为降级状态，不能标记为完全不可见。

在 macOS 上，Electron 使用 `NSWindowSharingNone`，但 Electron 41 自身的类型文档警告，使用现代 ScreenCaptureKit 的应用仍可能捕获该窗口。在 Linux 上该 API 不受支持。因此，设置是否展示及其状态必须依据平台能力，UI 需要在当前平台或捕获路径无法提供 Windows 文档语义时明确显示限制。

本实现不新增 Node-API 模块，也不自行发明 X11 或 Wayland 捕获协议。Windows 和 macOS 的原生调用已经由 Electron 承担，而当前技术栈没有公开的 Linux 应用侧等价原语。

主进程将集中维护符合条件的窗口策略，在窗口创建时和设置变化时对每个符合条件的顶层窗口应用状态。该策略覆盖桌面包中已识别的独立应用窗口创建点，同时排除 CUA 指示器以及明确不属于应用展示面的窗口。新窗口必须在显示前获得设置；只有在平台测试证明状态可能丢失时，才增加对 show、hide、最大化、还原或显示器变化的重新应用。

首个实现将明确内部捕获行为：WeCode 自己的截图和浏览器录制仍是用户主动发起的产品操作，不能静默继承导致源内容不完整的策略。CUA 屏幕捕获就绪探测和操作指示器必须继续工作。按捕获源设置例外的 API 延后到这些既有路径完成归属和测试后再定义。

## 影响面

- **设置契约** — `packages/shared/src/validationAppSettings.ts` 与 `packages/shared/src/protocol.ts`：新增默认值为 `false` 的 `stealthModeEnabled`，同时修改对象 schema、patch schema 和手工维护的 `AppSettings` 类型。
- **设置持久化** — 现有设置服务通过当前 schema 读写新字段；不新增 settings-sync 类别，因为这是本地桌面行为。
- **渲染端设置 UI** — `packages/ui/src/settingsPageHelpers.tsx` 与 `packages/ui/src/SettingsPage.tsx`：在常规区域新增桌面端设置行和真实的能力限制说明；沿用现有设置更新路径，不新增遥测事件。
- **语言资源** — `packages/ui/src/i18n/locales/en-US.ts` 与 `packages/ui/src/i18n/locales/zh-CN.ts`：按照仓库现有 TypeScript 语言包格式新增标题、描述、生效状态和降级支持文案。
- **主进程设置应用** — `packages/desktop/src/main/index.ts`：扩展 `syncImmediateAppSettings` 和初始设置读取，使现有窗口与新建符合条件的窗口同步更新。
- **窗口生命周期** — `packages/desktop/src/main/desktopWindowChrome.ts`、`packages/desktop/src/main/desktopWindowLifecycle.ts` 以及桌面包中独立创建 `BrowserWindow` 的位置：在每个符合条件的窗口显示前应用持久化设置，不能静默漏掉辅助窗口。
- **内部捕获路径** — `packages/ui/src/components/ai-elements/prompt-input-actions.tsx`、`packages/desktop/src/main/browserView/electronBrowserWebmRecorder.ts` 及 CUA 捕获/就绪代码：记录并测试每条路径是否有意包含或排除 WeCode 内容；没有归属者时不新增未来例外接口。
- **打包** — 本提案不新增原生二进制、`asarUnpack` 条目、electron-rebuild 步骤或平台专属签名路径。
- **遥测** — 启用或关闭该隐私控制不产生新的远程事件。

## 曾考虑的替代方案

**新增跨平台原生模块：** 否决。Windows 会重复 Electron 41 已经调用的 API，macOS 仍无法保证排除 ScreenCaptureKit，Linux 也没有等价的公开应用侧原语，还会增加原生构建、打包、签名和维护成本。

**承诺 Windows、macOS、Linux 都能真正隐身：** 否决。捕获行为由操作系统和捕获客户端共同决定。受支持的 Windows 捕获路径可以排除像素，但不能从其他进程的窗口枚举中删除窗口，也不能保证驱动级或合成器特定的捕获被阻止。

**在 Linux 使用 `_NET_WM_BYPASS_COMPOSITOR`、Dock 窗口类型或 foreign-toplevel 协议：** 否决。这些机制没有定义屏幕捕获排除语义，当前桌面集成中也不存在对应实现。

**把 WeCode 隐藏或移动到另一个虚拟桌面：** 否决。它会改变用户桌面行为，不能提供稳定的捕获保证，也破坏用户需要在本地继续查看 WeCode 的会议工作流。

**使用 CSS 或 Canvas 遮罩：** 否决。它只能影响渲染端控制的截图，不能控制操作系统屏幕捕获。

**把开关放在独立的隐私分区：** 本次迭代否决。常规区域已经承载桌面端行为开关；等会议录制和按捕获源设置策略成为独立能力后再评估。

## 验收标准

- 开启设置后，所有符合条件的现有桌面窗口无需重启即可更新；关闭后恢复正常捕获行为。
- 在 Windows 10 2004 及更高版本、DWM 正常合成且使用受测操作系统捕获路径时，桌面测试确认符合条件窗口的像素被排除，且没有黑色矩形或替代布局占据其原位置。
- UI 不声称窗口会从 Teams、Zoom 或其他客户端的窗口选择器中消失，也不声称能防止驱动级、虚拟机或合成器特定的捕获。
- 低于 Windows 2004 的版本显示降级支持说明，因为文档化的系统回退可能捕获黑色窗口。
- macOS 对基于 ScreenCaptureKit 的捕获显示限制说明，Linux 不将 Windows 的保证标记为受支持。
- 每个符合条件的独立 `BrowserWindow` 在显示前继承持久化设置；CUA 指示器保持现有行为。
- 在受测的 show、hide、最大化、还原和窗口重建路径中，设置不会静默恢复为关闭状态。
- WeCode 自己的截图、浏览器录制和 CUA 捕获路径都有明确测试，说明其是否有意包含或排除 WeCode 内容。
- 设置只出现在桌面端常规设置中，通过现有设置服务跨重启持久化，且不产生新的遥测事件。

## 风险

- Windows 捕获排除不是安全或 DRM 功能。捕获客户端仍可枚举窗口、使用其他捕获路径，或在操作系统窗口亲和性之外读取显示输出。
- 较旧 Windows 版本可能出现黑色捕获结果，因此 UI 必须区分降级支持与 Windows 2004+ 的受支持行为。
- macOS ScreenCaptureKit 和 Linux 合成器可能绕过或缺少所需排除能力；产品不能把这些平台展示为等价支持。
- 对所有辅助窗口应用保护可能隐藏用户原本想共享的对话框；符合条件窗口策略和内部捕获测试必须明确所有权边界。
- 如果 WeCode 自己的截图和录制功能直接继承外部捕获保护，可能产生内容不完整的结果，必须先做产品决策。
- 功能涉及多个独立窗口创建点。漏掉任何一个都会造成隐私行为不一致，因此窗口清单和生命周期测试必须随实现持续维护。
