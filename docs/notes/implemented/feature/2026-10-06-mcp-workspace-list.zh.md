# Agent Note: MCP workspace_list 接入 Host 工作区索引

Status: implemented

English | [English](2026-10-06-mcp-workspace-list.md)

## Problem

MCP 适配器此前通过 `WECODE_MCP_WORKSPACES` 环境变量返回工作区。这只能描述启动 MCP 进程时人为注入的字符串，无法反映 WeCode Host 的本地/远程工作区事实，也会让外部 Agent 看到与应用状态不一致的列表。

## Decision

扩展现有 Host `ISettingService` public port，增加只读 `listWorkspaces()`。实现从 Host 持有的 `lastWorkspaceSession` 和 `recentProjects` 构造稳定摘要，按 `workspaceIdentity?.trim() || workspacePath` 去重。MCP bridge 仅调用该 Port，不读取环境变量或维护第二份索引。

返回结果只包含 `kind`、`workspacePath`、`workspaceIdentity`、`label`、项目用途和远程连接状态，不返回 remote target、凭据或错误详情。

## Affected surfaces

改动覆盖 Host `ISettingService` public port、工作区索引投影、MCP Host bridge、MCP 特性 spec 和无密钥回放测试；不新增第二套工作区注册表，也不暴露远程连接凭据。

## Alternatives considered

- 新建独立 `IWorkspaceService`：语义更理想，但需要在所有 Host/远程 ServiceCollection 装配点增加一个新的 RPC channel，扩大本阶段变更面。
- 保留环境变量：实现简单，但不是 Host 事实源，无法支持真实桌面工作区和远程 workspace。

## Consequences

`workspace_list` 现在能反映 Host 已持久化的本地与远程工作区，空列表是合法结果。当前索引仍以设置中的已知工作区为边界；活动 workspace 注册表和 `connect-or-start` 属于后续阶段，不在本次实现中伪造。

## Verification

- `packages/services/test/workspaceList.test.ts`：无密钥验证本地/远程合并、去重和敏感字段过滤。
- MCP bridge 的 `workspace_list` 不再读取 `WECODE_MCP_WORKSPACES`。
