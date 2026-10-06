# Agent Note: MCP HTTP-Only Cleanup and Host ACL

Status: implemented

中文：[中文版](2026-10-06-mcp-http-only-cleanup.zh.md)

## Problem

The product contract is HTTP-only, but the repository still exposed an `mcp stdio` CLI command and MCP stdio SDK exports. The Host bridge also needed an explicit workspace boundary before session/task operations.

## Decision

Remove MCP-specific stdio APIs and CLI entries while retaining ordinary Desktop/Host stdio RPC. Validate every workspace-scoped MCP operation against the Host-owned `listWorkspaces()` index using `workspaceIdentity` first and `workspacePath` as the local fallback. Add protocol and bridge replay tests without credentials.

## Affected surfaces

The `packages/server` MCP protocol exports and tests, `packages/zcode-server-cli` command surface, Host tool adapter, MCP feature specification, and Agent Notes are changed. Ordinary internal RPC stdio is unchanged.

## Consequences

External clients use only the stable Streamable HTTP endpoint. Calls targeting a workspace absent from the current Host index fail with `WECODE_MCP_WORKSPACE_FORBIDDEN`.

## Alternatives considered

Keeping the old stdio command as a hidden compatibility path would preserve a second transport contract and reintroduce the launcher/install-artifact ambiguity rejected by the HTTP-only proposal.
