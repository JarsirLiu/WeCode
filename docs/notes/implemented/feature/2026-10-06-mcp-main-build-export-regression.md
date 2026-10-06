# Agent Note: MCP main-build export regression

Status: implemented

中文：[中文版](2026-10-06-mcp-main-build-export-regression.zh.md)

## Problem

The desktop main bundle imported the stable MCP port through `@zcode/server/mcp`, but the public entrypoint did not re-export it. Host and preload targets still built, while the main target failed and `dev:desktop` waited indefinitely for `.main-build-ready`.

## Decision

`DEFAULT_MCP_HTTP_PORT` is re-exported from the server MCP public entrypoint, and a server MCP test asserts the public contract and stable value. Desktop tsup remains the process-level startup smoke check.

## Affected surfaces

The `packages/server` MCP public entrypoint, desktop main bundle build, and MCP server test suite are affected. Runtime behavior and the HTTP wire format are unchanged.

## Alternatives considered

**Importing the HTTP module directly from Desktop:** rejected because it bypasses the package public entrypoint and weakens the cross-package contract.

**Relying only on a manual desktop launch:** rejected because a missing export can be detected deterministically in CI before a developer starts Electron.

## Consequences

The public export contract is now exercised by a no-key test. A successful unit suite does not replace the desktop tsup smoke build, which still validates that all Electron entrypoints bundle together.
