# Agent Note: MCP Streamable HTTP 运行时

Status: implemented

English: [English version](2026-10-06-mcp-http-runtime.md)

## Problem

对外 MCP 路径不能要求发布产品额外携带 Electron 或 Node stdio launcher。

## Decision

现有 HTTP server 通过官方 Web Standard Streamable HTTP transport 暴露 `/mcp`。每次请求前检查 `ISettingService.get().mcpEnabled`；工具执行由 Host 注入，协议适配器不持有业务状态。

## Affected surfaces

服务端 HTTP 路由和 MCP 适配器、桌面端配置展示及回放测试受到影响，不新增包或安装产物。

## Alternatives considered

**stdio launcher：** 放弃，因为外部客户端需要发现独立可执行文件，并会引入发布产物。

## Consequences

HTTP 服务必须和 Host 同时可用。关闭开关返回 `WECODE_MCP_DISABLED`；未接通 handler 时返回明确诊断错误，不伪造工具结果。
