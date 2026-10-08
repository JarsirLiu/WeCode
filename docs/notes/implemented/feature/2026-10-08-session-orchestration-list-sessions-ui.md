# Agent Note: Staged ListSessions tool UI

Status: implemented

English | [中文](2026-10-08-session-orchestration-list-sessions-ui.zh.md)

## Problem

`ListSessions` returned query parameters and a structured session list, but its tool card hid the query target and effective options while running.

## Decision

The existing session orchestration tool row projects `ListSessions` through its running and terminal states. The collapsed summary identifies the workspace; expanded input shows identity, optional path, archive inclusion, and limit, including the schema defaults of `false` and `50`. Completed output remains an allowlisted session count and per-session title, ID, and status.

## Affected surfaces

- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration-list-sessions.ts`
- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration.tsx`
- `packages/ui/src/i18n/locales/en-US.ts`
- `packages/ui/src/i18n/locales/zh-CN.ts`
- `packages/ui/test/sessionOrchestrationToolUi.test.ts`
- `docs/specs/features/ai-session-orchestration.md`

## Alternatives considered

- Leaving the query arguments inside raw tool JSON was rejected because the running card would not communicate which workspace or scope is being queried.
- Rendering the entire input or output object was rejected because it includes implementation details beyond the stable tool contract.

## Consequences

Callers can see both the target workspace and effective query options before the Host query completes. The UI remains a projection of the original tool call row and does not introduce another transcript item.
