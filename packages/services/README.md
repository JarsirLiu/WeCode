# @zcode/services

业务服务层：会话、凭据、Git、文件、进程、插件、provider 适配、遥测等。每个子目录是一个内聚的服务域，通过 `src/index.ts` 及若干显式入口对外暴露。

## 职责边界

- 服务日志使用 `createServiceLogger(scope)`（`src/logger/serviceLogger.ts`），不直接 `console.log`。
- 跨包导入走公开入口；服务之间通过显式契约调度，不互相深入实现路径。
- `managed: true` 的子模块（`storage`）遵循 `module.ts` + `contract.ts` + 分层（domain/app/adapters）契约；其它子域暂为 legacy，逐步收敛。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。

## 入口

公开入口见 `package.json` 的 `exports`，包括 `./src/index.ts`、`./src/storage-startup.ts`、`./src/node.ts`、`./src/cua-permission-broker/index.ts`、`./src/process/processTreeTerminator.ts`。

## 目录结构（按能力分组）

```txt
src/
  # 会话与任务
  zcode-session/  zcode-agent/  session/(legacy)  subagents/  tasksDatabase/
  # provider 与模型
  model-provider/  providers/  bigmodel/  coding-plan-subscription/
  # 凭据与 OAuth
  credential/  oauth/  client-config/  client-scenes/
  # 文件与 Git
  fs/  file/  fileWatcher/  git/  workspace?(via ui)
  # 进程与终端
  process/  terminal/  runtime-tools/  window-controller/
  # 插件与 MCP
  plugins/  plugin-sync/  official-mcp/  mcp-sync/  skill-sync/  skills/
  # 远控与同步
  remote-sync/  settings-sync/  conversation-share/  conversation-telemetry/
  # 设置与系统
  setting/  settings-sync/  system/  telemetry/  usage-stats/  memory/
  # 其它
  broadcast/  commands/  hooks/  logger/  media-preview/  onboarding/
  feedback/  device/  types/  cua-permission-broker/  prompt-attachment-transfer/
```

顶层有 `index.ts`、`accessor.ts`、`collection.ts`、`descriptors.ts`、`memoryDiagnostics.ts`、`node.ts`、`paths.ts`、`storage-startup.ts`。`storage/` 是唯一 `managed: true` 模块（owner: desktop-settings），有完整 domain/app/adapters 分层与 `contract.ts`。完整子目录与计数运行 `pnpm architecture:context services`。

## 测试

测试位于 `packages/services/test`（`src` 的兄弟目录，不在模块根内），运行入口以 `package.json` 为准。

## 不要在这里做

- 不要绕过 `createServiceLogger` 直接打日志。
- 不要在服务层 `process.exit` 或直接输出到终端；错误向上冒泡到 CLI 入口层。
- 不要把 `workspaceIdentity` 退化为路径匹配（远程链路必须带 identity）。

## 相关

- 行为权威：`AGENTS.md` § 进程、协议与远程控制、§ 日志、§ Workspace Identity。
- 模块声明：`architecture-policy.yaml`（id: `services`，子模块 `session`/`storage`）。
- 导航索引：`docs/modules.md`；深度上下文：`pnpm architecture:context services`。
