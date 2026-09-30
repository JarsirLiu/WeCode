// ============================================================
// AI Session Orchestration Tools Contracts
// ============================================================
//
// 6 tools: create_session, send_session_message, read_session,
// stop_session_generation, set_session_model, compact_session
//
// spec: docs/specs/ai-session-orchestration.md

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

// Tool names
export const CREATE_SESSION_TOOL_NAME = "CreateSession";
export const SEND_SESSION_MESSAGE_TOOL_NAME = "SendSessionMessage";
export const READ_SESSION_TOOL_NAME = "ReadSession";
export const STOP_SESSION_GENERATION_TOOL_NAME = "StopSessionGeneration";
export const SET_SESSION_MODEL_TOOL_NAME = "SetSessionModel";
export const COMPACT_SESSION_TOOL_NAME = "CompactSession";
export const RESOLVE_SESSION_PERMISSION_TOOL_NAME = "ResolveSessionPermission";

export const ResolveSessionPermissionInputSchema = z.object({
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(["allow_once", "allow_always", "deny"]),
  reason: z.string().max(4096).optional(),
}).strict();
export const ResolveSessionPermissionOutputSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["resolved", "already_resolved"]),
  decision: z.enum(["allow_once", "allow_always", "deny"]),
}).strict();
export const ResolveSessionPermissionInputJsonSchema = toToolJsonSchema(ResolveSessionPermissionInputSchema);
export const ResolveSessionPermissionOutputJsonSchema = toToolJsonSchema(ResolveSessionPermissionOutputSchema);
export const RESOLVE_SESSION_PERMISSION_DESCRIPTION = "Resolve one exact pending permission for a session you created with delegated approval. Only allow_once and deny are supported; use ReadSession to obtain the requestId.";

// ============================================================
// CreateSession
// ============================================================
export const CreateSessionInputSchema = z
  .object({
    workspacePath: z.string().min(1),
    workspaceIdentity: z.string().optional(),
    mode: z.enum(["auto", "plan", "build", "edit", "yolo", "autoEdit"]).optional(),
    modelSelection: z.record(z.string(), z.unknown()).optional(),
    model: z.string().optional(),
    thoughtLevel: z.string().optional(),
    draftSessionId: z.string().optional(),
    forkedFromTaskId: z.string().optional(),
    automationId: z.string().optional(),
    offPeakTaskId: z.string().optional(),
    approvalPolicy: z.enum(["manual", "delegated", "autonomous"]).optional(),
    initialPrompt: z.string().min(1).optional(),
  })
  .strict();

export const CreateSessionOutputSchema = z
  .object({
    taskId: z.string(),
    traceId: z.string(),
    title: z.string(),
    workspacePath: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    mode: z.enum(["auto", "plan", "build", "edit", "yolo", "autoEdit"]),
    titleOverridden: z.boolean().optional(),
    workspaceIdentity: z.string().optional(),
    workspacePurpose: z.string().optional(),
    model: z.string().optional(),
    thoughtLevel: z.string().optional(),
    runtimeEpoch: z.number().optional(),
    initialSlashCommands: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict();

// 类型名加 Tool 后缀，避免与 session-store.port.ts 的 CreateSessionInput 冲突。
export type CreateSessionToolInput = z.infer<typeof CreateSessionInputSchema>;
export type CreateSessionToolOutput = z.infer<typeof CreateSessionOutputSchema>;

export const CreateSessionInputJsonSchema = toToolJsonSchema(CreateSessionInputSchema);
export const CreateSessionOutputJsonSchema = toToolJsonSchema(CreateSessionOutputSchema);

export const CREATE_SESSION_DESCRIPTION = [
  "Create a new WeCode session/task in the specified workspace. Returns the taskId for subsequent operations.",
  "",
  "Modes:",
  "  - yolo: fully autonomous, no approval prompts (recommended for background tasks)",
  "  - auto: default, asks for approval on sensitive operations",
  "  - plan: planning mode, read-only analysis",
  "  - build: build-focused mode",
  "  - edit: edit-focused mode",
  "  - autoEdit: auto with edit bias",
  "",
  "approvalPolicy defaults to manual. delegated/autonomous are recorded for host policy enforcement; they do not let this tool approve a request.",
  "",
  "Optional initialPrompt: sends the first message immediately after creation. That turn wakes you with a session/changed notification when it completes, fails, or requests approval — same as send_session_message.",
  "",
  "The returned taskId is used with send_session_message, read_session, stop_session_generation,",
  "set_session_model, and compact_session.",
].join("\n");

// ============================================================
// SendSessionMessage
// ============================================================
export const SendSessionMessageInputSchema = z
  .object({
    taskId: z.string().min(1),
    content: z.string().min(1),
    traceId: z.string().min(1),
    queryId: z.string().optional(),
    messageId: z.string().optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    clientId: z.string().optional(),
    clientLabel: z.string().optional(),
    toolDenylist: z.array(z.string()).optional(),
    modelSelection: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const SendSessionMessageOutputSchema = z
  .object({
    messageId: z.string().min(1),
    turnId: z.string().min(1),
    acceptedAt: z.number().int().nonnegative(),
    deduplicated: z.boolean(),
  })
  .strict();

export type SendSessionMessageInput = z.infer<typeof SendSessionMessageInputSchema>;
export type SendSessionMessageOutput = z.infer<typeof SendSessionMessageOutputSchema>;

export const SendSessionMessageInputJsonSchema = toToolJsonSchema(SendSessionMessageInputSchema);
export const SendSessionMessageOutputJsonSchema = toToolJsonSchema(SendSessionMessageOutputSchema);

export const SEND_SESSION_MESSAGE_DESCRIPTION = [
  "Send a message to an existing WeCode session/task (like a user would).",
  "",
  "Required: taskId (from create_session), content (the prompt text), traceId (for tracing).",
  "",
  "Optional: attachments, clientId/clientLabel (for bot delivery tracking),",
  "toolDenylist (tools to hide for this turn), modelSelection (override model for this turn).",
  "",
  "The message is delivered asynchronously. Returns a host admission receipt immediately;",
  "reuse its messageId unchanged when retrying the same message.",
  "",
  "When the target session finishes the turn — completed, failed, permission requested, or stopped —",
  "you receive a session/changed notification; read the authoritative state with read_session",
  "(afterSeq for incremental reads). You may also wait a while and call read_session to fetch the reply.",
].join("\n");

// ============================================================
// ReadSession
// ============================================================
export const ReadSessionInputSchema = z
  .object({
    sessionId: z.string().min(1),
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(),
  })
  .strict();

// 输出是完整 session 快照（ZCodeSessionStateSnapshot）或紧凑 task 快照或 null。
// 用 z.unknown() 避免 contracts 侧手写一份与 shared schema 漂移的 bespoke 结构；
// 真正的 wire 校验由 broker 用 shared 的 zcodeSessionReadSessionResultSchema 做。
// 模型从 description 了解返回结构，不需要逐字段 JSON schema。
export const ReadSessionOutputSchema = z.unknown();

export type ReadSessionInput = z.infer<typeof ReadSessionInputSchema>;
export type ReadSessionOutput = unknown;

export const ReadSessionInputJsonSchema = toToolJsonSchema(ReadSessionInputSchema);
export const ReadSessionOutputJsonSchema = toToolJsonSchema(ReadSessionOutputSchema);

export const READ_SESSION_DESCRIPTION = [
  "Read the full state of a WeCode session (history, runtime status, todos, etc.).",
  "",
  "Required: sessionId (the taskId or session identifier).",
  "",
  "Optional: messageLimit (default 50), afterSeq (for incremental reads).",
  "",
  "Returns a structured snapshot with: session info, settings, runtime status, messages,",
  "todos, goals, and available slash commands. Primary usage: read the authoritative state",
  "after a session/changed wake-up notification (afterSeq gives incremental reads).",
  "Also usable as a low-frequency fallback poll when no notification arrives.",
  "",
  "The snapshot carries context pressure in projection (contextUsed, contextWindow, totalTokenCount)",
  "and runtime.contextUsage (used, size, cost) — use contextUsed/contextWindow to decide when to",
  "call compact_session.",
].join("\n");

// ============================================================
// StopSessionGeneration
// ============================================================
export const StopSessionGenerationInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().optional(),
  })
  .strict();

export const StopSessionGenerationOutputSchema = z.object({}).strict();

export type StopSessionGenerationInput = z.infer<typeof StopSessionGenerationInputSchema>;
export type StopSessionGenerationOutput = z.infer<typeof StopSessionGenerationOutputSchema>;

export const StopSessionGenerationInputJsonSchema = toToolJsonSchema(StopSessionGenerationInputSchema);
export const StopSessionGenerationOutputJsonSchema = toToolJsonSchema(StopSessionGenerationOutputSchema);

export const STOP_SESSION_GENERATION_DESCRIPTION = [
  "Stop the currently running generation in a WeCode session/task.",
  "",
  "Required: taskId. Optional: runId (specific run to stop, otherwise stops current).",
  "",
  "The stopped turn is marked as interrupted and the session returns to idle — there is no",
  "'stopped' session status. You will be woken by a session/changed notification with kind=generation_stopped;",
  "use read_session afterwards for the authoritative state.",
  "Does not delete the session — use compact_session or let the user resume manually.",
].join("\n");

// ============================================================
// SetSessionModel
// ============================================================
export const SetSessionModelInputSchema = z
  .object({
    taskId: z.string().min(1),
    traceId: z.string().min(1),
    modelSelection: z.record(z.string(), z.unknown()),
  })
  .strict();

export const SetSessionModelOutputSchema = z
  .array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(["select", "boolean"]),
        currentValue: z.union([z.string(), z.boolean()]),
        options: z.array(z.object({ value: z.string(), name: z.string() })).optional(),
      })
      .strict(),
  );

export type SetSessionModelInput = z.infer<typeof SetSessionModelInputSchema>;
export type SetSessionModelOutput = z.infer<typeof SetSessionModelOutputSchema>;

export const SetSessionModelInputJsonSchema = toToolJsonSchema(SetSessionModelInputSchema);
export const SetSessionModelOutputJsonSchema = toToolJsonSchema(SetSessionModelOutputSchema);

export const SET_SESSION_MODEL_DESCRIPTION = [
  "Change the model for a WeCode session/task. Returns the authoritative configOptions from the server.",
  "",
  "Required: taskId, traceId, modelSelection (providerId + modelId + optional thoughtLevel).",
  "",
  "The returned configOptions array is the server's authoritative list — use it to confirm the change",
  "or present available options to the user for further changes.",
].join("\n");

// ============================================================
// CompactSession
// ============================================================
export const CompactSessionInputSchema = z
  .object({
    taskId: z.string().min(1),
    inputId: z.string().optional(),
  })
  .strict();

export const CompactSessionOutputSchema = z
  .object({
    response: z.string(),
    snapshot: ReadSessionOutputSchema,
    compact: z
      .object({
        state: z.enum(["accepted", "already_running"]),
        inputId: z.string().optional(),
        operationId: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type CompactSessionInput = z.infer<typeof CompactSessionInputSchema>;
export type CompactSessionOutput = z.infer<typeof CompactSessionOutputSchema>;

export const CompactSessionInputJsonSchema = toToolJsonSchema(CompactSessionInputSchema);
export const CompactSessionOutputJsonSchema = toToolJsonSchema(CompactSessionOutputSchema);

export const COMPACT_SESSION_DESCRIPTION = [
  "Compact a WeCode session/task to summarize its context and free window space.",
  "",
  "Required: taskId. Optional: inputId (the stable V4 command id for retries).",
  "",
  "Timing: idle target compacts immediately as a background compact turn; a running turn is never",
  "aborted — the request queues as a FIFO barrier and runs between turns. A second compact while",
  "one is running or queued is rejected.",
  "",
  "Decide from read_session's projection, weighing absolute usage (contextUsed) first and the ratio",
  "(contextUsed / contextWindow) second:",
  "- Under 128k tokens used: compact cautiously — a small context loses more detail than it saves.",
  "- Reaching 200k tokens used: prioritize compacting — call compact_session before your next message.",
  "- Above 300k tokens used: almost certainly compact now, before dispatching any further work.",
  "- Small-window models: the contextUsed/contextWindow ratio forces the decision even below 200k;",
  "  compact when the window is filling, not only at the absolute thresholds.",
  "Below 20% of the window and under ~128k tokens it is a judgment call, not a skip — compact at a",
  "natural boundary (the target just finished a milestone phase, you are about to dispatch a new",
  "independent subtask, or there was heavy tool output).",
  "Do not rely on the runtime's automatic compaction: it only fires near the window ceiling",
  "(window minus output reserve), which wastes tokens and degrades quality on large-window models.",
  "",
  "Resolve pending permissions first — compacting while pendingPermissions is non-empty queues",
  "behind the blocked turn. Returns the compact response and the updated session snapshot.",
].join("\n");
