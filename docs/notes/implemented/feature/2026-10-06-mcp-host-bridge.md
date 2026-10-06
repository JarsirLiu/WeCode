# Agent Note: MCP Host Bridge

Status: implemented

English | [中文](2026-10-06-mcp-host-bridge.zh.md)

## Problem

The MCP stdio process previously exposed only the protocol shell. Its default handler always threw a Phase 2 placeholder error, so `tools/call` could never reach a real WeCode session. The adapter now connects to the existing local Host through the versioned loopback capability endpoint and uses the public `IZCodeTaskService` and `IZCodeSessionService` RPC descriptors.

## Decision

- The Host remains the sole owner of task, session, permission, and MCP-enabled state.
- The adapter holds only short-lived RPC proxies; it does not cache session state or start a second business runtime.
- The adapter requests a one-time Host capability before opening `/ws/host` and checks `AppSettings.mcpEnabled` before serving the MCP connection and before every tool call.
- MCP tool names use the stable snake_case names from the feature spec.

## Affected surfaces

The change affects the `packages/zcode-server-cli` stdio adapter, the `packages/server` MCP tool registry and schemas, the existing Host `/ws/host` RPC boundary, and the MCP feature spec and regression tests. It does not add a second session store or a new business HTTP API.

## Alternatives considered

Embedding Desktop/Electron objects in the MCP process was rejected because it couples external clients to the development checkout and duplicates lifecycle ownership. A new HTTP business API was also rejected because the existing RPC service surface already carries the required V4 command path.

## Consequences

The released launcher must provide the Host status/control location to the adapter. A disabled setting now produces a stable `WECODE_MCP_DISABLED` error before tools are exposed. The remaining release task is packaging a standalone launcher/runtime and staging it without Electron or repository paths.
