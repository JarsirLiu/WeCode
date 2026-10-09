# Agent Note: ReadSession cross-workspace routing

Status: implemented

English | [中文](2026-10-08-read-session-cross-workspace-routing.zh.md)

## Problem

`ReadSession` accepts a globally unique session ID, but the agent-side broker currently resolves the target workspace through its in-memory `context.sessions` map. That map only contains runtimes resident in the calling agent process, so a session created in another workspace or a cold persisted session fails before the Host can read it. The Host already supports starting a workspace agent on demand for ordinary read requests; the missing capability is target-session location.

## Decision

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

### Transport and ownership boundary

"Reverse request" describes only the direction of the control-plane call: the CLI Agent that is executing the AI tool sends a request to the Host over the existing bidirectional stdio protocol. It does not introduce a second session-loading implementation. The Host remains the owner of global target lookup, caller authorization, workspace routing, and service dispatch; `IZCodeSessionService.readSession` and `IZCodeTaskService` remain the only Host service entry points.

The request must preserve two identities:

```text
callerSessionId  -> trusted context, authorization, audit, trace
targetSessionId  -> global index lookup and target operation
```

The broker must build trusted workspace context from the caller session. It must not call `requireSession` or any equivalent resident-session lookup with `targetSessionId`; a target may be cold, resident in another workspace, or resident in another Agent process. The Host resolves the target workspace before calling the same service path used by the desktop UI. A same-workspace target therefore uses the normal low-latency route, while a reclaimed target uses the existing `start-if-needed` and `session/read` cold-resume lifecycle.

The protocol is intentionally bidirectional and multiplexed: while the Host is servicing the Agent's reverse request, it may send the ordinary `session/read` or task command to the target Agent runtime and return the result on the pending reverse request. No polling queue or second runtime is created for this exchange.

## Implementation status

The Host task index resolves `task_id` directly, the broker builds trusted context from the caller session, and the Host executor resolves and authorizes the target before dispatching to the existing session/task services. Read and target task operations therefore reuse the target workspace and existing start-if-needed runtime lifecycle.

Implementation files include `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/zcode-session-broker.ts`, `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/browser-control-broker.ts`, `packages/services/src/zcode-agent/zcodeTaskServiceExecutorFactory.ts`, `packages/services/src/zcode-agent/taskTargetResolver.ts`, `packages/services/src/zcode-agent/zcodeTaskCommandExecutor.ts`, and `packages/services/src/zcode-agent/zcodeTaskSessionRelay.ts`. Credential-free replay coverage is in `packages/services/test/wecodeSessionRoutingReplay.test.ts` and `packages/services/test/wecodeTaskTargetRouting.test.ts`; the service test suite passes without credentials.

## Affected surfaces

- Agent broker and reverse protocol request shape for `session/readSession`.
- Host `ZCodeTaskServiceExecutor` / `IZCodeSessionService` dispatch, with a target-session locator dependency.
- Global session/task index persistence and lookup by session ID.
- Existing workspace runtime selection in `packages/services/src/zcode-agent/zcodeAgentService.ts`.
- ReadSession handler contract remains unchanged; its UI work is independent.
- The existing desktop `IZCodeSessionService.readSession` path remains the runtime and snapshot owner; no CLI-only or Host-only duplicate projection is introduced.
- Cross-workspace, same-workspace cold-session, remote-session, authorization, and nested reverse-request replayable tests.

## Alternatives considered

- **Require `workspacePath` or `workspaceIdentity` in the ReadSession tool input.** Rejected for the public tool because the session ID already identifies the target and exposing a second routing key creates mismatch and stale-identity cases. Internal routing may still carry the resolved identity.
- **Scan every workspace until the session ID is found.** Rejected because latency and remote side effects grow with workspace count, and an unavailable remote workspace would delay unrelated reads.
- **Require the target runtime to remain active.** Rejected because it wastes resident-process resources and conflicts with the existing `start-if-needed` read path and cold-session persistence model.
- **Read messages directly from the global SessionStore without starting the target workspace runtime.** Rejected for the first implementation because `ReadSession` returns a runtime-derived snapshot, context usage, tool-call status, and pending permissions; bypassing the runtime would create a second projection with divergent semantics.

## Consequences

The shipped path satisfies these acceptance conditions: caller and target identities are separate; Host lookup and relation authorization precede service dispatch; the existing target runtime start-if-needed path handles cold reads; remote identity and relation-provided remote session identity remain part of target dispatch; and credential-free replay coverage verifies target routing, caller remote identity, unknown/ambiguous lookup, and unauthorized targets. The trade-off is that the Host task index and peer relation data must remain current for unknown, deleted, and unauthorized targets to fail closed.

The locator becomes a new Host-owned routing fact and must stay synchronized with session creation, imports, forks, legacy remote identity repair, and deletion. A stale locator must fail visibly rather than fall back to the caller workspace or `process.cwd()`. Cold reads and remote reconnects can exceed the normal active-read latency, so cancellation, bounded timeouts, and explicit diagnostics are required. Nested requests must remain multiplexed and cancellation-aware so an Agent tool call cannot strand a Host-to-target runtime request.
