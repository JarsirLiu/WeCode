# Agent Note: ReadSession exposes management status

Status: implemented

[中文版](2026-10-10-read-session-status-summary.zh.md)

## Problem

The Host session snapshot already contained the active model, reasoning level, mode, context counters, and pending permission request IDs. The AI-facing `ReadSession` projection discarded the settings and reduced permissions to a count, so an orchestrator could not decide when to change model, compact context, or resolve a specific request.

## Decision

- Keep `ReadSession` as the single AI read and status entry point.
- Add the active model, reasoning level, mode, and bounded pending permission summaries to its output.
- Keep context counters in the same summary and preserve the existing recent message/tool-call limits.
- Do not expose `approvalPolicy`; the desktop-compatible session mode is the permission behavior source.
- Do not expose full model catalogs, permission inputs/options, or tool inputs/outputs at the AI boundary.

## Alternatives considered

**Add a new `GetSessionStatus` tool:** rejected because it would create a second read path over the same authoritative snapshot and force the model to call two tools for one state decision.

**Expose the complete session snapshot:** rejected because UI-only settings, tool payloads, and model catalogs are large and may contain data that is unnecessary for orchestration.

## Consequences

`ReadSession` callers can now select a known model, compact when context pressure is high, and resolve an exact pending request. The Host remains the owner of session state and cold recovery; the tool only receives a bounded projection.

## Affected surfaces

- AI session orchestration contract and `ReadSession` summary projection.
- Core tool wiring replay test.
- AI session orchestration feature spec.
