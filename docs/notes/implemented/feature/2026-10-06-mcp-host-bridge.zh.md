# Agent Note: MCP Host Bridge

Status: implemented

English | [中文](2026-10-06-mcp-host-bridge.md)

## Problem

MCP stdio 进程之前只有协议外壳，默认 handler 总是抛出占位错误，`tools/call` 无法到达真实 WeCode 会话。

## Decision

适配器通过本机回环 capability 端点连接现有 Host，并使用公开的 `IZCodeTaskService` 与 `IZCodeSessionService` RPC 描述符。Host 是 task、session、permission 和 MCP 开关状态的唯一所有者。适配器只保留短生命周期 RPC proxy，在提供连接前及每次工具调用前读取 `AppSettings.mcpEnabled`。MCP 工具名采用稳定的 snake_case。

## Affected surfaces

改动覆盖 `packages/zcode-server-cli` stdio 适配器、`packages/server` MCP 工具注册和 schema、现有 Host `/ws/host` RPC 边界，以及 MCP 特性 spec 和回归测试。不新增第二套 session 存储或业务 HTTP API。

## Alternatives considered

**嵌入 Desktop/Electron 对象：** 放弃，因为会把外部客户端绑定到开发仓库并重复生命周期所有权。

**新增业务 HTTP API：** 放弃，因为现有 RPC 服务面已经承载所需的 V4 命令路径和 capability 鉴权。

## Consequences

正式发布的 launcher 仍必须向适配器提供 Host 状态/控制位置。关闭设置后，在工具暴露前返回稳定的 `WECODE_MCP_DISABLED` 错误。无 Electron、无仓库路径的独立 launcher/runtime 打包和 staging 验证仍是发布任务。
