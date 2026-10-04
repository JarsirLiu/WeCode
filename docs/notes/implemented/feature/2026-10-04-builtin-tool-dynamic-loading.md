# Agent Note: Built-in Tool Dynamic Loading

Status: implemented

[中文](2026-10-04-builtin-tool-dynamic-loading.zh.md)

## Problem

Current state: all 48 built-in tools are registered at startup, consuming 20k+ tokens in the first turn's context. This overhead is paid regardless of which tools the model will actually use. Models often need only a small subset (e.g., file I/O + Bash), making the full toolset wasteful. When new tool groups are added, the startup cost grows unbounded.

## Affected surfaces

**Runtime surfaces**:
- `ToolExecutionContext`: LoadToolSet handler accesses registry state and reports tool loading results
- `ToolRegistry`: stores registered tools; LoadToolSet triggers batch registration of unloaded tools
- Tool caching: `runtime.invalidateToolCache()` called after LoadToolSet to recompute model schema
- `WORKFLOW_CHILD_DISALLOWED_TOOLS`: LoadToolSet added to prevent child workflows from mutating parent runtime state

**Protocol/contract surfaces**:
- `LoadToolSetInputSchema` / `LoadToolSetOutputSchema` / `LoadToolSetErrorSchema`: new contracts in `@zcode/contracts`
- `LOAD_TOOL_SET_TOOL_NAME` exported constant

**UI/model-facing surfaces**:
- Model schema: first turn includes 12 tools (core 10 + task-control 2); LoadToolSet allows loading 36 additional tools on demand
- Tool visibility: unloaded toolsets invisible to model (not in registry.list(), not in contracts)

**File structure**:
- New: `apps/zcode-cli/packages/contracts/src/tools/load-tool-set.ts`
- New: `apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts`
- Modified: `apps/zcode-cli/packages/contracts/src/tools/index.ts` (export LoadToolSet types)
- Modified: `apps/zcode-cli/packages/core/src/tool/handlers/index.ts` (register loadToolSetToolEntry)
- Modified: `apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts` (add LoadToolSet to WORKFLOW_CHILD_DISALLOWED_TOOLS)

## Decision

Implement **LoadToolSet** — a meta-tool that allows the model to dynamically load tool groups at runtime. The system is designed as a two-stage strategy:

1. **First turn**: expose only 10 core tools (Read, Write, Edit, Bash, WebFetch, WebSearch, TodoRead, TodoWrite, Glob, Grep) + TaskOutput + TaskStop (~5k tokens).
2. **On demand**: model calls `LoadToolSet(toolset_id: "automation" | "workflow" | "session" | …)` to load a group (2-10 tools). Once loaded, tools stay in the session's ToolRegistry and do not need reloading.
3. **No visibility**: unloaded toolsets are invisible to the model — not in registry.list(), not in schema, not discoverable.

### Architecture

**Tool grouping (8 toolsets, 48 tools)**:
- **core** (10): Read, Write, Edit, Bash, WebFetch, WebSearch, TodoRead, TodoWrite, Glob, Grep — always active
- **task-control** (2): TaskOutput, TaskStop — always active (main session only)
- **plan** (2): EnterPlanMode, ExitPlanMode
- **automation** (6): CronCreate, CronList, CronUpdate, CronDelete, OffPeakCreate, OffPeakList
- **session** (7): CreateSession, SendSessionMessage, ReadSession, StopSessionGeneration, SetSessionModel, CompactSession, ResolveSessionPermission
- **subagent** (8): Agent, Task, Skill, SendMessage, RespondToCoordinator, submit_result, escalate, ReadSessionContext
- **workflow** (10): CreateWorkflow, AmendWorkflow, SaveWorkflow, EvalWorkflowSnippet, ListSavedWorkflows, ListModels, ListWorkflowRuns, GetWorkflowRun, ResumeWorkflowRun, ResolveWorkflowQuestion
- **js** (1): node_repl
- **bot** (1): BotCommand

**Contract layer** (`apps/zcode-cli/packages/contracts/src/tools/load-tool-set.ts`):
- `ToolSetSpec`: immutable metadata (id, description, keywords, tool list, defaultEnabled flag)
- `LoadToolSetInput`: model input (toolset_id)
- `LoadToolSetOutput`: success response (toolset_spec, loaded_tools[], already_loaded_tools[], total_tools)
- `LoadToolSetError`: failure response (code: TOOLSET_NOT_FOUND | LOAD_FAILED | INVALID_TOOLSET_ID, message, available_toolsets)

**Handler** (`apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts`):
- Metadata: readOnly=true, destructive=false, concurrentSafe=true, needsApproval=false, riskLevel=low, sideEffectScope=runtime_state
- Execution: validates toolset_id against TOOL_SETS registry, returns spec + tool names
- **Current state**: placeholder implementation (reports expected tools; actual registration deferred to runtime integration)

**Runtime integration**:
- LoadToolSet execution triggers runtime to:
  1. Load ToolEntry instances for requested tools (currently unimplemented)
  2. Register each unloaded tool via `registry.register(entry)`
  3. Call `runtime.invalidateToolCache()` to recompute model schema
- Cache invalidation follows MCP precedent (`runtime/methods/mcp.ts:147`)

**Child protection**:
- LoadToolSet added to `WORKFLOW_CHILD_DISALLOWED_TOOLS` (structural prohibition) — child workflows cannot load tool groups, which would pollute the parent session's runtime state and break reproducibility

**Glob/Grep retention**:
- Glob/Grep tools remain in core toolset (not hidden)
- Embedded search provides Bash shell function acceleration (find/grep); it's a supplement, not replacement
- Bash find/grep truncated to 30k; Glob/Grep handle structured output + token budgeting for large searches

## Alternatives considered

**Why not start with all tools hidden and load incrementally?** — Context reset after each session means all tools are reloaded anyway. Hiding all tools (requiring model to discover + load before any work) delays the first real action. Keeping 10 core tools loaded balances immediate utility (file I/O, Bash, web queries) against context cost.

**Why not batch-load tools by heuristic?** — LLM behavior is unpredictable; tool usage patterns vary by session. Explicit model-driven loading avoids speculative loads that go unused, and gives the model agency to request exactly what it needs.

**Why not use ToolSearch as the sole discovery mechanism?** — ToolSearch is read-only meta-discovery; it describes unloaded toolsets without giving access. LoadToolSet is the execution gate. Separating concerns keeps meta-discovery lightweight and leaves LoadToolSet to handle registration, caching, and child protection.

**Why defer actual tool registration to runtime integration?** — Handler execution runs in the ToolExecutionContext, which does not have direct access to all 48 ToolEntry definitions (they're scattered across handler/*.ts files). Centralizing ToolEntry imports in `handlers/index.ts` and using dependency injection or a registry lookup would couple the handler to all handler modules, creating a circular dependency. Runtime post-processing can access the registry and invalidate the cache more cleanly. *(Note: this integration remains unimplemented; placeholder handler will be superseded in a follow-up)*

## Consequences

**Positive**:
- First-turn context reduction: ~5k tokens (core tools) vs ~20k tokens (all tools) — 75% savings for sessions that don't need the full suite
- Backward compatible: existing code using all 48 tools works unchanged (load them on demand)
- Session-scoped caching: once loaded, toolset stays available for the session lifetime; no re-registration on each turn
- Model control: explicit LoadToolSet calls let models manage tool namespace and avoid cognitive overload
- Child protection: WORKFLOW_CHILD_DISALLOWED_TOOLS prevents child workflows from mutating parent state

**Negative**:
- Extra round-trip: model must learn about toolsets, call LoadToolSet, then use the tools (adds turn overhead if loading is deferred to mid-session)
- Discovery UX: model must call ToolSearch or know toolset IDs; no implicit guessing based on task description
- Implementation complexity: runtime integration deferred; placeholder handler does not actually load tools yet

**Deferred**:
- Actual tool registration in LoadToolSet handler (runtime integration: load ToolEntry instances, call registry.register, invalidate cache)
- Integration tests for tool loading + cache invalidation
- UI/discovery surface for listing available toolsets

## Testing

**Current**: type checking and linting pass; architecture check passes.

**Required** (integration tests):
1. LoadToolSet with valid toolset_id → tools registered and queryable from registry
2. LoadToolSet with invalid toolset_id → error with available_toolsets list
3. LoadToolSet for already-loaded toolset → already_loaded_tools list populated
4. After LoadToolSet, model schema updated (new tools visible in contracts)
5. Child workflow blocked from calling LoadToolSet (WORKFLOW_CHILD_DISALLOWED_TOOLS enforcement)
6. Tool cache invalidation called after LoadToolSet execution

*Note: tests deferred pending runtime integration implementation.*

## Related

- Spec: [builtin-tool-dynamic-loading.md](../../../specs/architecture/builtin-tool-dynamic-loading.md)
- Registry: [registry.ts](../../../../apps/zcode-cli/packages/core/src/tool/registry.ts)
- MCP tool registration precedent: [mcp.ts](../../../../apps/zcode-cli/packages/core/src/runtime/methods/mcp.ts)
- Child tool allowlist: [tool-allowlist.ts](../../../../apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts)
