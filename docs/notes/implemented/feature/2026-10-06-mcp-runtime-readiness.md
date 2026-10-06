# Agent Note: MCP runtime readiness

Status: implemented

中文：[中文版](2026-10-06-mcp-runtime-readiness.zh.md)

## Problem

The settings page previously rendered the stable MCP URL whenever the app was running, even when the server-core listener had not started or its fixed port was occupied. That produced a configuration that looked valid but could not connect.

## Decision

The desktop Host and server-core expose the same loopback `39173` listener. The main-process configuration resolver probes `HEAD /mcp` before returning the single HTTP configuration. The endpoint returns readiness and respects the MCP setting gate. The probe is deliberately on the same path as the protocol and creates no MCP session.

## Affected surfaces

The MCP HTTP handler, desktop Host listener, desktop main-process configuration resolver, and settings-page availability state are affected. The wire protocol remains `POST /mcp`.

## Alternatives considered

- Reading a supervisor status file would couple Desktop to the CLI runtime layout and could become stale.
- A second health endpoint would make the advertised network surface larger and introduce another port/path contract.

## Consequences

The settings UI may show unavailable while the Host is starting or after a port conflict; users must retry after the Host becomes ready. External clients continue to use only `POST /mcp` and are unaffected by the probe.

## Follow-up fix

The desktop main bundle imports the stable port through the `@zcode/server/mcp` public entrypoint. That entrypoint now re-exports `DEFAULT_MCP_HTTP_PORT` from the HTTP adapter. Without this export, tsup failed the main target while host and preload still built, leaving `dev:desktop` waiting forever for `.main-build-ready`.
