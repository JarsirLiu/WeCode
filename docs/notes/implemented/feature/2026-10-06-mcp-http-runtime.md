# Agent Note: MCP Streamable HTTP Runtime

Status: implemented

中文：[中文版](2026-10-06-mcp-http-runtime.zh.md)

## Problem

The external MCP path must not require an Electron or Node stdio launcher in the published product.

## Decision

The existing HTTP server exposes `/mcp` through the official Web Standard Streamable HTTP transport. `ISettingService.get().mcpEnabled` is checked before every request. Tool execution is injected by the Host; the protocol adapter owns no business state. The server-core path injects a Host-service handler for all nine tools. MCP uses the fixed loopback port 39173, while ordinary Host/RPC uses a separate dynamic port.

## Affected surfaces

The server HTTP routing and MCP adapter, desktop configuration display, and replay tests are affected. No package or install artifact is added.

## Alternatives considered

**stdio launcher:** rejected because external clients must discover a separate executable and it introduces a publish artifact.

**Common development port:** rejected because ports such as 3030 are frequently occupied; MCP uses a dedicated fixed port and reports conflicts instead of changing the URL.

## Consequences

The HTTP server and Host must be available together. Disabled requests return `WECODE_MCP_DISABLED`; an unconnected handler returns an explicit diagnostic error instead of fabricated tool results.
