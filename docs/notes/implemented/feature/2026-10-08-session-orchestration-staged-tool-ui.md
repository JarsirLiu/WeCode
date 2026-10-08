# Agent Note: Staged WorkspaceList tool UI

Status: implemented

English | [中文](2026-10-08-session-orchestration-staged-tool-ui.zh.md)

## Problem

`WorkspaceList` returned a structured workspace index, but its dedicated tool card dropped the list during rendering. The card also lacked a clear completed projection while the Host request was still represented by the same running tool row.

## Decision

The existing session orchestration renderer keeps one tool row and projects `WorkspaceList` through the existing running, success, and error states. Running cards show the tool action; completed cards show a workspace count and an allowlisted summary for each workspace (label, path, identity, kind, and optional purpose or connection status). Invalid JSON keeps the existing plain-text fallback and failed calls keep the Host error.

## Affected surfaces

- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration.tsx`
- `packages/ui/test/sessionOrchestrationToolUi.test.ts`
- `docs/specs/features/ai-session-orchestration.md`

## Alternatives considered

- Adding a second result-only tool row was rejected because tool call and result already share the `ToolLayout` lifecycle and would duplicate transcript state.
- Rendering the complete Host JSON was rejected because it exposes unstable fields and is harder to scan.

## Consequences

Workspace discovery is readable in the same staged card style as other synchronous tools. `SendSessionMessage` and `CreateSession` retain their existing admission and creation semantics and are outside this change.
