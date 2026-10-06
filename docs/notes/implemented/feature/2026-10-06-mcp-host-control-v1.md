# Agent Note: MCP Host Control Contract v1

Status: implemented

English | [中文](2026-10-06-mcp-host-control-v1.zh.md)

## Problem

The MCP adapter only connected to an already-running Host. A released external Agent could not recover a stopped Host and had no stable distinction between an unavailable Host, a launcher failure, and a startup timeout.

## Decision

Add a versioned `connect-or-start` control boundary in the server CLI runtime. The adapter reuses a ready Host, waits for a starting Host, or invokes the stable launcher with `serve --daemon`; it polls the persisted status snapshot and returns contract version 1 plus stable error codes. Corrupt or unreadable status fails closed.

## Affected surfaces

The change affects MCP Host startup in `packages/zcode-server-cli`, the CLI contracts and status snapshot, the MCP feature spec, and no-key lifecycle tests. It does not start Desktop/Electron during development or stop a shared Host when an MCP process exits.

## Alternatives considered

Starting Electron directly was rejected because the published MCP path must use the standalone launcher. Reusing only the WebSocket endpoint was rejected because it cannot recover an offline Host or distinguish lifecycle failures.

## Consequences

The first MCP connection may start the installed local Host and waits up to 15 seconds for readiness. Existing connections become invalid after a Host restart and must reconnect. Development fallback can invoke the current CLI entry, while release installations are expected to contain the stable launcher.

## Verification

`mcpHostControl.test.ts` verifies offline start and ready-host reuse without credentials or Desktop startup.
