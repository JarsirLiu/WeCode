# Agent Note: Restore core build after the LoadToolSet executor split

Status: implemented

[中文](2026-10-05-executor-split-wiring.zh.md)

## Problem

Commit `466ec43` ("feat: implement LoadToolSet tool for dynamic builtin tool loading") split `call-runner.ts` into four files and added the `LoadToolSet` handler, but the result never compiled: 17 type errors across `load-tool-set.ts`, `tool-set-loader-port.ts`, `call-runner.ts`, `execution-context-builder.ts`, and `tool-result-handler.ts`. The `@zcode/core` package `pnpm build` (tsc) failed on this branch from that commit forward. The break was carried forward as if it were pre-existing tech debt rather than a compile regression introduced by the feature work.

## Decision

Repair the wiring the split lost and restore `pnpm build` to green. No behavior change — every fix restores pre-split `call-runner.ts` semantics. Three groups: A (import paths), B (ToolEntry shape), C (executor split wiring).

## Root cause

Three failure modes, all "split refactor forgot the wiring":

1. **Wrong import paths.** `load-tool-set.ts` imported `createCoreError`/`CoreErrorType` from a nonexistent `../../error/index.js` (the package has `errors/` plural; the symbol actually lives in `@zcode/contracts`). `tool-set-loader-port.ts` imported `ToolEntry` from `../../../tool/types.js` — one `../` too many for `src/runtime/helpers/` → `src/tool/types.ts`.

2. **ToolEntry declared against an imagined API.** `loadToolSetToolEntry` used fields that don't exist on `ToolEntry extends ToolContractDeclaration`: `capability` as an object (real type: `string`), `execute` instead of `handler`, `executionMode: "normal"` (valid: `"client" | "providerNative"`), `sideEffectScope: "runtime_state"` (valid: `"none" | "workspace" | "git" | "network" | "system" | "session" | "userInteraction"`), and `inputSchema` as a Zod object (real type: `JsonSchema`). Required `permission`/`resultBudget`/`timeout`/`cancellation`/`trace` blocks were missing entirely. The sibling `readSessionToolEntry` already had the correct shape to copy.

3. **Executor split lost type wiring.** Extracting `resolveModelOutputEntry` into `model-output-entry.ts` left the original declaration in `call-runner.ts` (import-vs-local conflict). The new `execution-context-builder.ts` typed `traceId`/`turnId` as plain `string` instead of branded `TraceId`/`TurnId`, imported `SessionEvent` from `../types.js` (which only imports, never re-exports, it), and read `subagentModelOverride` from `deps` (the field lives on `ToolExecuteOptions`, not `ToolExecutorDeps`). Three call sites passed `number | undefined` / `boolean | undefined` into required params.

## Fix

| Group | File(s) | Repair |
|-------|---------|--------|
| A | `tool-set-loader-port.ts` | Import path `../../../tool/types.js` → `../../tool/types.js` |
| A | `load-tool-set.ts` | Import `createCoreError`/`CoreErrorType` from `@zcode/contracts` (sibling `read-session.ts` precedent); drop unused `getToolEntry` import |
| B | `load-tool-set.ts` | Rewrite `loadToolSetToolEntry` to mirror `readSessionToolEntry`: `capability: string`, `handler`, `inputSchema`/`outputSchema` as JsonSchema, `runtimeInputSchema`/`runtimeOutputSchema` as Zod, `executionMode: "client"`, `sideEffectScope: "session"`, plus full `permission`/`resultBudget`/`timeout`/`cancellation`/`trace` blocks |
| C | `call-runner.ts` | Delete stale local `resolveModelOutputEntry` (the extracted version in `model-output-entry.ts` is already imported) |
| C | `execution-context-builder.ts` | `SessionEvent` from `@zcode/contracts`; `traceId: TraceId`, `turnId: TurnId`; add `subagentModelOverride` to `ExecutionContextBuilderInput`, destructure it, read from input (not `deps`) |
| C | `call-runner.ts` | Thread `subagentModelOverride: options?.subagentModelOverride` into the `buildExecutionContext` call |
| C | `tool-result-handler.ts` | `turnId?: TurnId` |
| C | `call-runner.ts` | Coalesce `permissionWaitMs ?? 0`, `serialization?.returnedBytes ?? 0`, `serialization?.truncated ?? false` |

**Verification**: `pnpm build` (core, tsc) — 17 errors → 0. `pnpm typecheck` (root) — pass. `pnpm lint` — 0 errors (14 pre-existing warnings, none in touched files). `pnpm fmt:check` — pass. `pnpm architecture:check --changed` — 0 violations. `pnpm size:check` — 3 failures, all pre-existing in `packages/ui/src/v4/`, none in touched files. No runtime test executed: the `@zcode/core` package has no test script, so `tsc` is the only gate (it type-checks test files too).

## Alternatives considered

**Why not revert `466ec43`?** — The split is structurally sound: it separates context building, result handling, and model-output resolution from the call runner, and it ships the LoadToolSet feature. Reverting would discard a legitimate cleanup. Repairing the wiring preserves both.

**Why coalesce `permissionWaitMs`/`returnedBytes`/`truncated` at the call site instead of widening the callee signatures to accept `undefined`?** — Coalescing at the source (where `permissionResult.permissionWaitMs` is read, where `serialization?.` is dereferenced) keeps callee contracts strict and makes the "undefined means zero/false" default explicit at the point of consumption. Widening the callee would push the null-handling question to every future caller.

**Why thread `subagentModelOverride` through `ExecutionContextBuilderInput` rather than add it to `ToolExecutorDeps`?** — The override is per-call (it lives on `ToolExecuteOptions`, which varies per `execute()` invocation); `ToolExecutorDeps` is the executor's stable wiring. Putting a per-call field on `deps` would imply it is executor-scoped, which is wrong.

## Consequences

**Positive**:
- `@zcode/core` compiles for the first time since `466ec43`; the LoadToolSet feature and the executor split are now actually usable rather than dead-on-arrival.
- `loadToolSetToolEntry` follows the same `ToolEntry` shape as `readSessionToolEntry`, so permission, budget, timeout, and trace gates apply uniformly to the meta-tool.
- Branded-type discipline (`TraceId`/`TurnId`) restored in the split files, matching the pre-split single-file code.

**Negative**:
- The fix touches the executor pipeline that runs every tool call, so a latent regression would affect all tools. Mitigation: each repair restores pre-split semantics, so the regression surface is "did I restore the original wiring correctly", not "did I change behavior".
- `LoadToolSet` runtime integration (actually registering tools via `toolSetLoaderPort`) remains unimplemented; this fix only makes the handler compile and register its `ToolEntry`. The feature note's deferred items still stand.

## Related

- Feature note: [builtin-tool-dynamic-loading.md](../feature/2026-10-04-builtin-tool-dynamic-loading.md)
- Sibling handler precedent: [read-session.ts](../../../../apps/zcode-cli/packages/core/src/tool/handlers/read-session.ts)
- ToolEntry contract: [contract.ts](../../../../apps/zcode-cli/packages/contracts/src/tools/contract.ts)
