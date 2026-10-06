# Agent Note: MCP Streamable HTTP config type

Status: implemented

English: [English version](2026-10-06-mcp-streamable-http-config-type.md)

## Problem

生成的 MCP JSON 只有 `url`。Cherry Studio 等不从 URL 推断传输类型的客户端可能把该条目识别为 stdio，从而拒绝 HTTP endpoint。

## Decision

唯一生成的 `mcpServers.wecode` 条目现在在 URL 旁显式包含 `type: "streamable_http"`。宿主侧的内置 server 记录也保留这个传输类型字段。MCP server 对外声明版本 `0.1.0`，表示首个公开 HTTP 契约版本，独立于桌面应用版本和 MCP 协议版本。

## Affected surfaces

受影响的是 MCP client-config 生成器、桌面端内置 server 投影、设置页 JSON 输出和无密钥 MCP 配置测试。HTTP endpoint 与运行时端口不变。

## Alternatives considered

**保留只有 URL 的简写：** 放弃，因为不同客户端的传输推断不一致，可能选择 stdio。

**按客户端生成多种格式：** 放弃，因为会违反唯一稳定配置规则并造成格式漂移。

## Consequences

支持 Streamable HTTP 的客户端可以不依赖推断直接选择正确传输。忽略该可选类型字段的客户端仍可使用同一个 URL。
