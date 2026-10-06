# Agent Note: MCP HTTP-only product proposal

Status: implemented

English | [中文](2026-10-06-mcp-http-only-proposal.zh.md)

## Problem

The previous proposal treated local stdio and a standalone launcher as the release path. That would require an executable command on the user's machine and could lead to a separate runtime artifact, which conflicts with the requirement not to increase desktop/CLI package size or add an MCP installer.

## Decision

The product proposal now supports only MCP Streamable HTTP. A desktop endpoint reuses the existing running Host and binds to loopback by default; a cloud Gateway reuses the existing backend/Host for remote workspaces. External Agents connect by URL and do not spawn WeCode, Electron, Node, or a separate MCP package. stdio is explicitly out of product scope.

## Affected surfaces

The change affects the MCP feature specification, configuration JSON shape, transport architecture, authentication/workspace authorization requirements, lifecycle semantics, and release acceptance tests. Existing stdio implementation files remain migration code until the HTTP endpoint is implemented and then are removed or retired in a separate code change.

## Alternatives considered

Keeping stdio as the primary transport was rejected because it requires a locally available executable. Shipping a standalone CLI/runtime was rejected because it adds a release artifact and package footprint. Supporting both transports was rejected for the first product contract because it doubles authentication, lifecycle, and acceptance surfaces.

## Consequences

The settings page will show one stable HTTP configuration containing a URL and short-lived credential mechanism. Local workspace access requires the desktop Host endpoint to be running; remote workspace access requires the cloud Gateway and its ACL. The MCP adapter must never start a second business runtime from an HTTP request.

## Verification

The revised spec requires an HTTP MCP harness with no installer, Electron child process, source path, or plaintext secret.
