# Agent Note: MCP Streamable HTTP config type

Status: implemented

中文：[中文版](2026-10-06-mcp-streamable-http-config-type.zh.md)

## Problem

The generated MCP JSON contained only `url`. Clients that do not infer transport from a URL, including Cherry Studio in this configuration flow, could classify the server as stdio and reject the endpoint.

## Decision

The single generated `mcpServers.wecode` entry now includes the explicit `type: "streamable_http"` discriminator alongside its URL. The same discriminator is retained in the host-side built-in server record. The MCP server advertises version `0.1.0`, the first public HTTP contract version, independently of the desktop application and MCP protocol versions.

## Affected surfaces

The MCP client-config generator, desktop built-in server projection, settings JSON output, and no-key MCP config tests are affected. The HTTP endpoint and runtime port are unchanged.

## Alternatives considered

**Keep the URL-only shorthand:** rejected because client transport inference is not consistent and can select stdio.

**Generate separate client-specific formats:** rejected because it would violate the single stable configuration rule and create format drift.

## Consequences

Clients that support Streamable HTTP can select the correct transport without inference. Consumers that ignore the optional discriminator continue to use the same URL.
