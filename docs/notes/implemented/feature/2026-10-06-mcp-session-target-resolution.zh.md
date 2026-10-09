# Agent Note: MCP session target resolution

Status: implemented

English: [English version](2026-10-06-mcp-session-target-resolution.md)

## Problem

MCP bridge 每次会话操作都只根据本次请求参数校验 workspace。`create_session` 后外部客户端通常只保存返回的 session id，因此 `read_session` 和发消息会被误判为未授权。另一个问题是 schema 已声明 `initialPrompt`，handler 却没有真正提交它。

## Decision

Host task service 新增 `resolveTaskTarget({ taskId })`，从既有 task index 和内存 target 表解析 Host 持有的 `workspacePath` 与 `workspaceIdentity`。MCP 会话工具统一先解析该目标，再执行 workspace ACL，schema 不要求调用方重复传 workspace。历史 `create_session.initialPrompt` 已迁移为必填 `message`，创建成功后经同一 task service 提交；提交失败直接让 MCP 调用失败，不返回空会话成功。模型选择使用共享 picker parser 或结构化 selection；V4 compact 不再暴露不支持的 instructions；审批决策映射为 V4 allow/deny，同时保留 option id 精确匹配。

## Affected surfaces

变更覆盖 task service public contract、task adapter、MCP Host bridge、工具描述、MCP 特性 spec 和协议回放测试。不新增第二份 session 注册表或 MCP 本地 workspace 缓存。

## Alternatives considered

**每次调用都要求 workspacePath：** 放弃，因为重复了 Host 会话身份，也是本次 read/send 失败的直接原因。

**在 MCP 进程内维护映射：** 放弃，因为 Host 重启后会与事实不一致，形成第二个状态源。

## Consequences

外部 Agent 拿到 session id 后即可管理会话。workspace 授权仍由 Host 持有并默认拒绝。首条消息无法入队时调用方会收到错误，需要重试或显式新建会话。
