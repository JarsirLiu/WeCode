# Agent Note: Add WorkspaceList and ListSessions session orchestration tools

Status: implemented

[中文](2026-10-05-workspace-list-sessions.zh.md)

## Problem

AI session orchestration had seven tools (CreateSession, SendSessionMessage, ReadSession, StopSessionGeneration, SetSessionModel, CompactSession, ResolveSessionPermission) but lacked the two discovery capabilities the model needs before it can act. The model cannot see which workspaces exist, so `create_session`'s `workspacePath` is a blind guess. Given a workspace, the model cannot see which sessions already exist in it, so it creates new sessions duplicatively instead of continuing an existing conversation.

`workspace_ensure` (creating or returning a workspace from no path) was rejected: a workspace's path is a user decision, not a tool responsibility. The tools should surface what already exists — read-only discovery — so the user or model can decide where to act.

## Decision

Add two read-only tools to the session orchestration toolset, registered under the existing `includeZCodeTask` gate (the session management toolset). The `includeZCodeTask` gate already controls the seven existing session orchestration tools; these two discovery tools belong in the same toolset.

**WorkspaceList** (`apps/zcode-cli/packages/core/src/tool/handlers/workspace-list.ts`): aggregates local workspaces from `zcodeTaskPort.listTasks()`, grouped by `workspacePath`, with `workspaceIdentity = hashWorkspacePath(workspacePath)`. Returns `workspaceIdentity`, `workspacePath`, `label`, `kind`, `projectType`, `lastActiveAt`, `activeSessionCount`. Remote workspace listing is a stub (deferred).

**ListSessions** (`apps/zcode-cli/packages/core/src/tool/handlers/list-sessions.ts`): passes through to `zcodeSessionPort.listSessions()` → broker `session/listSessions` → `IZCodeSessionService.listSessions`. Takes `workspaceIdentity` (required), `workspacePath` (optional), `includeArchived` (default false), `limit` (default 50, max 200).

Both tools return `workspaceIdentity` as the cross-Host/remote routing key, matching the existing identity convention (`workspaceIdentity?.trim() || workspacePath`).

## Affected surfaces

**Contract surfaces** (`@zcode/contracts`):

- New constants: `WORKSPACE_LIST_TOOL_NAME`, `LIST_SESSIONS_TOOL_NAME`
- New schemas: `WorkspaceListInputSchema`/`OutputSchema`/`InputJsonSchema`/`OutputJsonSchema` + `WorkspaceInfo` interface
- New schemas: `ListSessionsInputSchema`/`OutputSchema`/`InputJsonSchema`/`OutputJsonSchema` + types
- New descriptions: `WORKSPACE_LIST_DESCRIPTION`, `LIST_SESSIONS_DESCRIPTION`
- Modified `tool-set-loader.port.ts`: `registerTool`/`registerTools` params loosened from `ToolEntry`/`ToolEntry[]` to `unknown`/`unknown[]`, removing the `ToolEntry` import that would create a contracts↔tools circular dependency now that the port is re-exported from the barrel
- Modified `index.ts`: re-exports `tool-set-loader.port.js` so `ToolSetLoaderPort` is accessible from `@zcode/contracts`
- Formatting-only: existing schemas (`ResolveSessionPermission`, `StopSessionGeneration`, `SetSessionModel`) reformatted by prettier; no behavior change

**Runtime surfaces** (`@zcode/core`):

- New handlers: `workspace-list.ts`, `list-sessions.ts`
- Modified `handlers/index.ts`: registers both tools under the `includeZCodeTask` gate; adds both to `ZCODE_TASK_TOOL_NAMES` (now 10 tools when the gate is on)

**Spec surfaces**:

- New `docs/specs/features/mcp-server-support.md`: documents the full MCP Server plan. WorkspaceList and ListSessions are the first shipped pieces; the transport layer (stdio + HTTP+SSE), CLI `mcp` subcommand, and remote workspace injection are deferred per the spec's implementation order.

**Test surfaces**:

- New `core/test/workspace-list-sessions.test.ts`: 4 tests — registration gating (on with `includeZCodeTask`, off without), registration plan inclusion, WorkspaceList schema validation (empty input accepted, extra fields rejected), ListSessions schema validation (valid input, defaults, empty `workspaceIdentity` rejected)

## Alternatives considered

**Why not `workspace_ensure` (create-or-return workspace)?** — A workspace's path is a user decision; creating one without a user-chosen path is the wrong responsibility for a tool. WorkspaceList is read-only discovery, not creation — it surfaces existing workspaces and lets the user or model decide where to act.

**Why not combine workspace_list and list_sessions into one tool?** — They have different inputs (none vs. `workspaceIdentity`) and different data sources (task service vs. session service). Combining would force the model to provide a `workspaceIdentity` even for the discovery step, creating a chicken-and-egg problem. Separate tools match the two-step UX: discover workspaces → pick one → list its sessions → pick or create.

**Why register under `includeZCodeTask` instead of a new gate?** — The `includeZCodeTask` gate already controls all seven session orchestration tools; adding two discovery tools under the same gate keeps the toolset cohesive and avoids introducing a new gate that would need separate wiring.

**Why defer remote workspaces in WorkspaceList?** — Remote workspace injection (`context.remoteWorkspaces`) is still a stub. The local path (task service aggregation) covers the immediate use case. Remote support requires wiring `windowRemoteConnectionRegistry` through the execution context, tracked as a follow-up in the spec.

## Consequences

**Positive**:

- The model can discover workspaces and sessions before acting, instead of guessing `workspacePath` for `create_session`
- `workspaceIdentity` flows from `workspace_list` → `list_sessions` → `create_session` as the consistent routing key
- Both tools are read-only (`readOnly: true`, `destructive: false`, `needsApproval: false`, `riskLevel: "low"`) with no side effects
- Registered under the existing `includeZCodeTask` gate: pure CLI without `zcodeTaskPort` is unaffected
- 4 tests pin registration gating and schema validation

**Negative**:

- `hashWorkspacePath` is a simple hash local to the handler; it must stay consistent with the broker's identity computation. If the broker's identity scheme changes, this handler must track it.
- `detectProjectType` is a stub returning `"unknown"`; real project type detection is deferred.
- Remote workspace listing is a stub (empty); remote sessions are invisible to WorkspaceList until `context.remoteWorkspaces` is wired.
- Runtime integration tests (real `zcodeTaskPort`/`zcodeSessionPort`) are not written; only registration and schema tests exist.

**Deferred** (per spec `mcp-server-support.md`):

- MCP Server transport layer (stdio + HTTP+SSE) in `packages/server/src/mcp/`
- CLI `mcp` subcommand in `packages/zcode-server-cli/src/cli.ts`
- Remote workspace injection in execution context
- `detectProjectType` real implementation
- LoadToolSet runtime integration (actual tool registration via `toolSetLoaderPort`)

## Related

- Spec: [mcp-server-support.md](../../../specs/features/mcp-server-support.md)
- Session orchestration spec: [ai-session-orchestration.md](../../../specs/features/ai-session-orchestration.md)
- Sibling handler (ToolEntry shape reference): [read-session.ts](../../../../apps/zcode-cli/packages/core/src/tool/handlers/read-session.ts)
- LoadToolSet feature note: [builtin-tool-dynamic-loading.md](2026-10-04-builtin-tool-dynamic-loading.md)
- Bug-fix note for the executor split break that surfaced while wiring these tools: [executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
