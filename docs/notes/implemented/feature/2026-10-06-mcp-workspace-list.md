# Agent Note: MCP workspace_list Host index

Status: implemented

English | [中文](2026-10-06-mcp-workspace-list.zh.md)

## Problem

The MCP adapter previously returned `WECODE_MCP_WORKSPACES`. That environment variable only describes strings injected into the MCP process and cannot represent the Host's local and remote workspace facts.

## Decision

Extend the existing Host `ISettingService` public port with read-only `listWorkspaces()`. It derives stable summaries from Host-owned `lastWorkspaceSession` and `recentProjects`, deduplicated by `workspaceIdentity?.trim() || workspacePath`. The MCP bridge calls this port and maintains no second index.

The result is limited to `kind`, `workspacePath`, `workspaceIdentity`, `label`, project purpose, and remote connection status. Remote targets, credentials, and detailed connection errors are excluded.

## Affected surfaces

The change affects the `ISettingService` Host public port, its workspace index projection, the MCP Host bridge, the MCP feature spec, and no-key regression tests. It does not add a second workspace registry or expose remote connection credentials.

## Alternatives considered

- Add a separate `IWorkspaceService`: cleaner naming, but it requires a new RPC channel and registration in every Host and remote ServiceCollection during this phase.
- Keep the environment variable: simpler, but it is not Host state and cannot describe the real desktop workspace set.

## Consequences

`workspace_list` now reflects the local and remote workspaces persisted by the Host; an empty list is valid. The active runtime registry and `connect-or-start` remain later phases and are not fabricated here.

## Verification

- `packages/services/test/workspaceList.test.ts` covers merge, deduplication, and sensitive-field filtering without credentials.
- The MCP bridge no longer reads `WECODE_MCP_WORKSPACES`.
