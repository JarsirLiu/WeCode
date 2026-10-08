# Agent Note: Repair tool discovery and session orchestration contract failures

Status: proposed

English | [中文](2026-10-08-tool-discovery-session-schema-failures.zh.md)

## Problem

In session `sess_c7e3d172-33a2-413c-855c-54180296f73f` on 2026-10-08, the model needed user guidance to discover a tool set, guessed an invalid set ID, and encountered repeated session-management tool failures reported as schema errors. The run log is `C:\Users\341596\.zcode\cli\log\zcode-2026-10-08.jsonl`.

## Root cause

The runtime's deferred initial tool surface registers `LoadToolSet` but no `ToolSearch` or `ListToolSets`. `LoadToolSet` accepts an exact `toolset_id`; its input description points to nonexistent `ListToolSets`, while its own tool description offers no catalog or searchable categories. At 01:05:33, the model requested `conversation`; the handler rejected it and listed valid IDs (`core`, `task-control`, `plan`, `automation`, `session`, `subagent`, `workflow`, `js`, `bot`). This is a discoverability contract gap, not evidence that the provider omitted registered tools.

The same capability catalog is duplicated: the set-to-tool mapping lives in `load-tool-set.ts`, individual entries in `tool-catalog.ts`, and the architecture spec also describes a catalog. This permits drift and explains why documentation can name discovery behavior that the runtime does not provide.

The `ListSessions` output contract is incompatible with the value its handler returns. `ListSessionsOutputSchema` requires each item to contain top-level `workspacePath` and a simplified status set, but `ZCodeSessionPort.listSessions()` returns shared `ZCodeSessionInfo` objects with nested `workspace`, `sessionKind`, and protocol status values. The handler returns those objects directly. At 01:10:13, 01:10:17, and 01:10:25 the executor rejected the output with `runtimeOutputSchema validation` and `Required`. The generic error omits the failing path, obscuring this mismatch.

ReadSession also failed at 01:10:10 and 01:10:17 with `Session is not active` for a session returned during the orchestration flow. The current evidence confirms the read path could not serve that target at that time, but does not establish whether the target was persisted, whether cold-resume capability was available, or which lifecycle state should be readable. This needs a targeted reproduction before deciding whether the defect is in tool semantics, Host routing, or runtime recovery.

## Proposal

Provide a real, always-visible discovery tool that searches the same authoritative catalog used by `LoadToolSet`, returning valid set IDs, descriptions, tool names, availability, and loaded state. Correct the `LoadToolSet` description so it names the actual discovery tool and its exact input field. Remove duplicated set membership data or generate it from one source.

Align `ListSessions` output with the shared `ZCodeSessionInfo` contract, or explicitly project the shared result into the documented tool shape at the handler boundary. Do not loosen validation with catch-all fields to conceal missing required values. Preserve field paths in output validation diagnostics.

For `ReadSession`, reproduce reads of active, completed-but-persisted, archived, and newly-created sessions. Then specify whether the tool must cold-resume persisted sessions or report a structured not-readable state; implement only the behavior supported by the existing Host ownership and recovery contracts.

## Fix

The first repair slice is implemented: a real, first-turn-visible `ToolSearch` is registered and reads the same tool-set catalog as `LoadToolSet`. Results expose exact tool-set IDs, descriptions, keywords, tool names, and loaded state. `LoadToolSet` now directs the model to `ToolSearch`, and a no-secret replayable test covers first-turn registration and session tool-set discovery.

The second repair slice is implemented: `ListSessions` now projects shared `ZCodeSessionInfo` into its documented flat summary before runtime validation, with a no-secret handler/schema test. Runtime Zod validation diagnostics now include the failing field path (for example `$.sessions[0].workspacePath: Required`).

The third phase defines and implements `ReadSession` lifecycle semantics: the target session does not need to be running or resident. Reads reuse the formal `session/resume` activation path; completed, idle, and cold persisted sessions with a durable record are readable. Missing persistence returns `Session not found`, while activation failures retain the recovery error instead of collapsing into `Session is not active`.

## Affected surfaces

The proposed change affects the CLI runtime tool registry and handlers, `@zcode/contracts` tool schemas, the shared session info protocol contract, Host session routing/recovery, and the dynamic-tool and AI-session specs. It does not propose a second session store or a new ownership path for session state.

## Alternatives considered

- **Keep relying on model memory or user reminders:** rejected because the model-facing contract explicitly has no discoverable catalog and already directs the model to a nonexistent tool.
- **Add only `ListToolSets` as a static list:** rejected in favor of searchable discovery over the authoritative catalog, which avoids adding yet another separately maintained inventory.
- **Make `ListSessions` output validation permissive:** rejected because it hides the actual cross-layer shape mismatch and weakens the model contract without giving callers a stable shape.
- **Treat every `Session is not active` as proof that cold resume is broken:** rejected because the supplied log does not show target persistence or recovery capability; first reproduce and establish intended behavior.

## Acceptance criteria

- A model can discover the session tool set and its exact ID from the initial deferred tool surface without user hints or prior knowledge.
- The load input description references a registered discovery capability; invalid IDs return actionable guidance.
- The session-list handler returns data that passes both runtime and JSON Schema validation for empty and populated results.
- `ReadSession` can read any known target session; cold reads reuse the existing session resume lifecycle, and errors distinguish missing targets from recovery failures without false success.
- Tests run without credentials and exercise the real handler/port contract, not only isolated mock schema fixtures.

## Risks

Exposing the full tool-set catalog adds a small amount of prompt context and may reveal gated sets; discovery must distinguish discoverable from loadable sets using the same runtime gates. Changing session-list output shape can affect model prompts and callers, so the projection must be explicit and documented. Cold-resuming a session for a read may have side effects or cost; it must not be introduced until ownership, persistence, and runtime recovery semantics are verified.
