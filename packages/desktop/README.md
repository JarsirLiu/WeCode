# @zcode/desktop

Electron 应用包：main、host、preload、renderer、scheduler 五段。Desktop app 通过 stdio 与 Agent 通信；本包负责窗口、原生操作、进程调度和消息转发，**不承载 task/session 业务状态**。

## 职责边界

- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 桌面的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须区分；改 stream/snapshot/queue/重连时同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 协议改动同步更新 `packages/shared/src/zcode-protocol/index.ts`。

## 入口

`package.json` 的 `main` 指向 `out/main/index.js`（Electron 主进程构建产物，源在 `src/main/`）。跨包导入走公开入口，不深入 `src/` 内部。

## 目录结构

```txt
src/
  main/       Electron 主进程：窗口生命周期、app 启动/崩溃捕获、原生操作
  host/       window-scoped Local Host：attachment、cronRun、数据库启动协调、远控桥
  preload/    各 webview 的 preload 脚本（CUA 权限、浏览器录制、coding plan webview 等）
  renderer/   渲染入口与 CUA 权限面板等独立 webview（复用 @zcode/ui）
  scheduler/  串行 admission/owner/lease 调度：manualClaimRelease、offPeakDispatchSettlement
  shared/     main/preload/renderer 共享的 ARMS/遥测桥
```

每个子目录的文件计数和顶层文件运行 `pnpm architecture:context desktop`。

## 测试

测试入口以 `package.json` 和实际测试文件为准，不假定存在统一命令。交互改动需要 E2E 场景；涉及 stream/snapshot/重连时必须同时覆盖桌面实时与手机恢复两种语义。

## 不要在这里做

- 不要在 Main 存 task/session 业务状态（队列、快照、待办等交给服务层）。
- 不要为手机另起 Agent、Local Host 或远程会话；复用桌面已有 Host attachment。
- 不要仅按单一路径删除 owner/lease 或 stale run 边界判断。
- 不要把 `desktop-continuous` 与 `web-remote-replayable` 的语义混用。

## 相关

- 行为权威：`AGENTS.md` § 进程、协议与远程控制、§ UI 与平台边界。
- 模块声明：`architecture-policy.yaml`（id: `desktop`）。
- 导航索引：`docs/modules.md`；深度上下文：`pnpm architecture:context desktop`。
