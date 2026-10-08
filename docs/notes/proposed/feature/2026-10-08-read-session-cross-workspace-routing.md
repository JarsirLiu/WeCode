# Agent Note: ReadSession cross-workspace routing

Status: proposed

English | [中文](2026-10-08-read-session-cross-workspace-routing.zh.md)

## Problem

`ReadSession` accepts a globally unique session ID, but the agent-side broker currently resolves the target workspace through its in-memory `context.sessions` map. That map only contains runtimes resident in the calling agent process, so a session created in another workspace or a cold persisted session fails before the Host can read it. The Host already supports starting a workspace agent on demand for ordinary read requests; the missing capability is target-session location.

## Proposal

Keep the public `ReadSession` input as `sessionId`, `messageLimit`, and `afterSeq`. Add a Host-owned target-session locator path:

```text
ReadSession(sessionId)
  → agent broker sends targetSessionId plus caller identity
  → Host resolves target workspace from the global session/task index
  → Host checks the caller-to-target session relation
  → Host calls IZCodeSessionService.readSession with the target workspace
  → zcodeAgentService reuses or starts that workspace runtime
  → target runtime reads the persisted snapshot/event projection
```

The locator is an indexed Host query, never a scan of every workspace. Its authoritative record is written when a session is created or indexed and contains the target `workspaceIdentity` (or the local `workspacePath` fallback), remote session identity when applicable, and session ID. The existing `getReadOnlyClient(..., "start-if-needed")` path remains the lifecycle owner: `ReadSession` does not require the target runtime to stay resident, and it does not create a second runtime or polling queue.

The reverse protocol should carry the caller session ID separately from `targetSessionId`. Host routing uses the locator result for the target workspace and the caller ID only for authorization and audit. The target runtime returns the same persisted snapshot semantics used by existing `readSession`; in-flight, uncommitted model output is not promised.

## Affected surfaces

- Agent broker and reverse protocol request shape for `session/readSession`.
- Host `ZCodeTaskServiceExecutor` / `IZCodeSessionService` dispatch, with a target-session locator dependency.
- Global session/task index persistence and lookup by session ID.
- Existing workspace runtime selection in `packages/services/src/zcode-agent/zcodeAgentService.ts`.
- ReadSession handler contract remains unchanged; its UI work is independent.
- Cross-workspace, cold-session, and remote-session replayable tests.

## Alternatives considered

- **Require `workspacePath` or `workspaceIdentity` in the ReadSession tool input.** Rejected for the public tool because the session ID already identifies the target and exposing a second routing key creates mismatch and stale-identity cases. Internal routing may still carry the resolved identity.
- **Scan every workspace until the session ID is found.** Rejected because latency and remote side effects grow with workspace count, and an unavailable remote workspace would delay unrelated reads.
- **Require the target runtime to remain active.** Rejected because it wastes resident-process resources and conflicts with the existing `start-if-needed` read path and cold-session persistence model.
- **Read messages directly from the global SessionStore without starting the target workspace runtime.** Rejected for the first implementation because `ReadSession` returns a runtime-derived snapshot, context usage, tool-call status, and pending permissions; bypassing the runtime would create a second projection with divergent semantics.

## Acceptance criteria

1. A creator session in workspace A can read a session created in workspace B by passing only the target session ID.
2. The target runtime may be absent; Host locates workspace B, starts or reuses its read-only client, and returns the snapshot.
3. A completed or idle persisted session can be read after its runtime has been reclaimed.
4. Remote targets use exact `workspaceIdentity` and `remoteSessionId`; same-path remote workspaces are never conflated.
5. Unknown, deleted, or unlocatable IDs return a structured `sessionUnavailable`/not-found error without scanning or starting unrelated workspaces.
6. Authorization is evaluated against the caller session and target session relation; global ID uniqueness is not treated as authorization.
7. Active same-workspace reads keep their current low-latency path.

## Risks

The locator becomes a new Host-owned routing fact and must stay synchronized with session creation, imports, forks, legacy remote identity repair, and deletion. A stale locator must fail visibly rather than fall back to the caller workspace or `process.cwd()`. Cold reads and remote reconnects can exceed the normal active-read latency, so cancellation, bounded timeouts, and explicit diagnostics are required.
