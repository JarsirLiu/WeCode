# Agent Note: 新增 WorkspaceList 与 ListSessions 会话编排工具

Status: implemented

[English](2026-10-05-workspace-list-sessions.md)

## Problem

AI 会话编排此前有 7 个工具（CreateSession、SendSessionMessage、ReadSession、StopSessionGeneration、SetSessionModel、CompactSession、ResolveSessionPermission），但缺少模型在行动前所需的两个发现能力。模型看不到有哪些工作区存在，`create_session` 的 `workspacePath` 只能盲猜。给定一个工作区后，模型看不到该工作区下已有哪些会话，于是重复创建新会话而非继续已有对话。

`workspace_ensure`（无路径创建或返回工作区）被否决：工作区路径是用户决策，不是工具职责。工具应展示已有内容——只读发现——让用户或模型决定在哪里操作。

## Decision

新增两个只读工具到会话编排工具集，注册在已有的 `includeZCodeTask` 门控下（会话管理工具集）。该门控已控制 7 个现有会话编排工具，两个发现工具归属同一工具集。

**WorkspaceList**（`apps/zcode-cli/packages/core/src/tool/handlers/workspace-list.ts`）：通过 `zcodeTaskPort.listTasks()` 聚合本地工作区，按 `workspacePath` 分组，`workspaceIdentity = hashWorkspacePath(workspacePath)`。返回 `workspaceIdentity`、`workspacePath`、`label`、`kind`、`projectType`、`lastActiveAt`、`activeSessionCount`。远程工作区列表为占位（延后）。

**ListSessions**（`apps/zcode-cli/packages/core/src/tool/handlers/list-sessions.ts`）：透传到 `zcodeSessionPort.listSessions()` → broker `session/listSessions` → `IZCodeSessionService.listSessions`。入参 `workspaceIdentity`（必填）、`workspacePath`（可选）、`includeArchived`（默认 false）、`limit`（默认 50，最大 200）。

两个工具均返回 `workspaceIdentity` 作为跨 Host/远程路由键，与现有身份约定一致（`workspaceIdentity?.trim() || workspacePath`）。

## Affected surfaces

**契约面**（`@zcode/contracts`）：

- 新增常量：`WORKSPACE_LIST_TOOL_NAME`、`LIST_SESSIONS_TOOL_NAME`
- 新增 schema：`WorkspaceListInputSchema`/`OutputSchema`/`InputJsonSchema`/`OutputJsonSchema` + `WorkspaceInfo` 接口
- 新增 schema：`ListSessionsInputSchema`/`OutputSchema`/`InputJsonSchema`/`OutputJsonSchema` + 类型
- 新增描述：`WORKSPACE_LIST_DESCRIPTION`、`LIST_SESSIONS_DESCRIPTION`
- 修改 `tool-set-loader.port.ts`：`registerTool`/`registerTools` 参数从 `ToolEntry`/`ToolEntry[]` 放宽为 `unknown`/`unknown[]`，移除 `ToolEntry` 导入——该导入在 port 从 barrel 重导出时会形成 contracts↔tools 循环依赖
- 修改 `index.ts`：重导出 `tool-set-loader.port.js`，使 `ToolSetLoaderPort` 可从 `@zcode/contracts` 访问
- 仅格式化：现有 schema（`ResolveSessionPermission`、`StopSessionGeneration`、`SetSessionModel`）被 prettier 重格式化，无行为变更

**运行时面**（`@zcode/core`）：

- 新增 handler：`workspace-list.ts`、`list-sessions.ts`
- 修改 `handlers/index.ts`：在 `includeZCodeTask` 门控下注册两个工具；将两者加入 `ZCODE_TASK_TOOL_NAMES`（门控开启时共 10 个工具）

**Spec 面**：

- 新增 `docs/specs/features/mcp-server-support.md`：记录完整 MCP Server 计划。WorkspaceList 与 ListSessions 是首批落地的部分；传输层（stdio + HTTP+SSE）、CLI `mcp` 子命令、远程工作区注入按 spec 实现顺序延后。

**测试面**：

- 新增 `core/test/workspace-list-sessions.test.ts`：4 个测试——注册门控（`includeZCodeTask: true` 时开，否则关）、注册计划包含新工具、WorkspaceList schema 校验（空输入通过，额外字段拒绝）、ListSessions schema 校验（有效输入、默认值、空 `workspaceIdentity` 拒绝）

## Alternatives considered

**为何不做 `workspace_ensure`（创建或返回工作区）？** —— 工作区路径是用户决策，无用户指定路径就创建工作区是错误的职责划分。WorkspaceList 是只读发现，不是创建——展示已有工作区，让用户或模型决定在哪里操作。

**为何不把 workspace_list 和 list_sessions 合成一个工具？** —— 两者入参不同（无参 vs. `workspaceIdentity`）且数据源不同（task service vs. session service）。合并会迫使模型在发现阶段就提供 `workspaceIdentity`，形成鸡生蛋问题。分开匹配两步 UX：发现工作区 → 选一个 → 列出其会话 → 选或建。

**为何注册在 `includeZCodeTask` 而非新门控？** —— `includeZCodeTask` 门控已控制全部 7 个会话编排工具；在同一门控下再加 2 个发现工具保持工具集内聚，避免引入需要单独接线的新门控。

**为何 WorkspaceList 延后远程工作区？** —— 远程工作区注入（`context.remoteWorkspaces`）仍是占位。本地路径（task service 聚合）覆盖即时场景。远程支持需将 `windowRemoteConnectionRegistry` 接入执行上下文，是独立改动，spec 中已跟踪。

## Consequences

**正面**：

- 模型能在行动前发现工作区和会话，而非盲猜 `workspacePath`
- `workspaceIdentity` 从 `workspace_list` → `list_sessions` → `create_session` 一致流转作为路由键
- 两个工具均只读（`readOnly: true`、`destructive: false`、`needsApproval: false`、`riskLevel: "low"`），无副作用
- 注册在已有 `includeZCodeTask` 门控下：纯 CLI 无 `zcodeTaskPort` 的环境不受影响
- 4 个测试固定了注册门控与 schema 校验

**负面**：

- `hashWorkspacePath` 是 handler 内的简单哈希；必须与 broker 的身份计算保持一致。若 broker 身份方案变更，此 handler 须同步。
- `detectProjectType` 是返回 `"unknown"` 的占位；真实项目类型检测延后。
- 远程工作区列表是占位（空）；`context.remoteWorkspaces` 接入前远程会话对 WorkspaceList 不可见。
- 运行时集成测试（真实 `zcodeTaskPort`/`zcodeSessionPort`）未写；仅有注册与 schema 测试。

**延后**（按 spec `mcp-server-support.md`）：

- MCP Server 传输层（stdio + HTTP+SSE），位于 `packages/server/src/mcp/`
- CLI `mcp` 子命令，位于 `packages/zcode-server-cli/src/cli.ts`
- 执行上下文中的远程工作区注入
- `detectProjectType` 真实实现
- LoadToolSet 运行时集成（通过 `toolSetLoaderPort` 实际注册工具）

## Related

- Spec：[mcp-server-support.md](../../../specs/features/mcp-server-support.md)
- 会话编排 spec：[ai-session-orchestration.md](../../../specs/features/ai-session-orchestration.md)
- 同级 handler（ToolEntry 形状参照）：[read-session.ts](../../../../apps/zcode-cli/packages/core/src/tool/handlers/read-session.ts)
- LoadToolSet 特性 note：[builtin-tool-dynamic-loading.md](2026-10-04-builtin-tool-dynamic-loading.md)
- 接线这些工具时浮现的 executor 拆分回归 bug-fix note：[executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
