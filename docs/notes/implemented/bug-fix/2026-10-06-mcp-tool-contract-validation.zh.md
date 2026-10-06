# Agent Note: MCP tool contract validation

Status: implemented

English: [English version](2026-10-06-mcp-tool-contract-validation.md)

## Problem

MCP 工具列表使用手写 JSON schema，而 Host handler 把参数当成未校验的普通对象接收。这会导致工具公开的可选参数被忽略，也会静默接受未声明的参数别名。

## Decision

server 将 MCP contracts 作为外部工具输入的唯一契约来源。MCP 输入与 AI ToolEntry 输入按各自 transport 保持不同；两者通过共用 Host service 操作保持业务一致，而不是在不同信任上下文中复用同一个 handler。

## Root cause

MCP 工具描述和 schema 被复制在 server adapter 中，没有作为可执行契约维护。`read_session` schema 暴露了增量读取参数，但 Host 调用时丢弃了它们；`send_session_message` 则接受未公开的 `text` 别名。

## Fix

MCP 专用 Zod schema 和描述现在位于 contracts 包中。MCP `tools/list` 从这些 schema 生成 JSON Schema，Host handler 也用同一份运行时 schema 校验每次调用。`read_session` 透传 `messageLimit` 和 `afterSeq`，未声明字段会被拒绝。应用内 AI 仍保留独立的 ToolEntry 与调用方 session 执行上下文，但两种入口调用相同的 Host services。

## Affected surfaces

contracts 包、MCP server adapter 和 Host handler、MCP 特性 spec，以及无密钥 server 协议测试均有更新。server 会像现有运行时依赖一样打包 workspace contracts 包。

## Alternatives considered

**直接调用应用内 AI handler：** 不采用，因为这些 handler 需要 AI 调用方 session、ToolExecutor 权限与取消上下文；MCP 使用外部目标 session 标识，并在 Host 执行 workspace 授权。

**保留手写 JSON Schema 并信任调用方：** 不采用，因为公开 schema 与运行时行为已发生漂移，而且 MCP SDK 不负责 Host 层的工具参数校验。

**接受别名或推测缺失参数：** 不采用，因为这会掩盖客户端/schema 错误，并可能用非预期数据路由操作。

## Consequences

MCP 的公开参数仍按 transport 定义，但展示契约和实际执行契约不会独立漂移。无效或未公开的输入会明确失败；调用方必须遵守 `tools/list` 返回的 schema。
