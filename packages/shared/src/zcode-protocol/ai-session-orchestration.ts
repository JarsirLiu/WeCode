// ============================================================
// AI Session Orchestration 反向请求契约
// ============================================================
//
// agent 的 create_session / send_session_message / read_session /
// stop_session_generation / set_session_model / compact_session 六个工具经此发起
// Task/Session 反向请求，host 转给 IZCodeTaskService / IZCodeSessionService 执行。
//
// 独立成文件而非并入 ./index.js：index.js 的契约表若引用本文件，会与
// ../validation.js → ./index.js 构成循环依赖。方法名字典仍在 index.js 的
// zcodeProtocolMethods；本文件只放请求/结果 schema，方法契约表不收录本簇
// （broker 直接把 schema 传给 requestClient，无需经契约表）。
//
// 身份隔离：workspace 路由字段（workspaceKey/workspacePath/workspaceIdentity/
// remoteSessionId/clientMode）一律来自 host 从受信 session record 解析出的
// zcodeAiOrchestrationRequestContextSchema，agent 输入中的同名替代值会被覆盖。
//
// AI 侧只拿到紧凑视图：getTaskSnapshot 返回 zcodeAiTaskSnapshotSchema，而非完整
// ZCodeTaskSnapshot——后者含文件 checkpoint、slash commands、configOptions 等 UI
// 内部字段，整体塞给模型会爆 token 预算。映射发生在 host 侧执行桥。
//
// 范围约束（spec: docs/specs/ai-session-orchestration.md）：只覆盖 AI 编排需要的
// 操作。任务分组、归档、置顶、Claude 导入、快照分片等 UI 管理操作不进协议链路，
// UI 直接走 IZCodeTaskService RPC。
// ============================================================

import { z } from "zod";
import { nonEmptyStringSchema, zcodeTaskMetaSchema } from "../validation.js";
import { modelSelectionSchema } from "../model-selection.js";
import { zcodeTaskModeSchema } from "../zcode-task-mode-schema.js";
import { zcodeSessionInfoSchema } from "../zcode-protocol-legacy-types.js";
import {
  zcodeProtocolEmptyResultSchema,
  zcodeSessionCompactResultSchema,
  zcodeSessionStateSnapshotSchema,
} from "./index.js";

// ============================================================
// 受信请求上下文
// ============================================================

/**
 * 由 host 从受信 session record 解析（buildWorkspaceRequestContext），
 * agent 侧不得自行填写 workspace 路由字段。
 */
export const zcodeAiOrchestrationRequestContextSchema = z
  .object({
    requestId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    turnId: nonEmptyStringSchema.optional(),
    workspaceKey: nonEmptyStringSchema,
    workspacePath: nonEmptyStringSchema,
    workspaceIdentity: nonEmptyStringSchema.optional(),
    remoteSessionId: nonEmptyStringSchema.optional(),
    clientMode: z.enum(["desktop-continuous", "web-remote-replayable"]).optional(),
    sessionContext: z.literal("live").optional(),
  })
  .strict();
export type ZCodeAiOrchestrationRequestContext = z.infer<
  typeof zcodeAiOrchestrationRequestContextSchema
>;

// ============================================================
// ZCodeConfigOption —— setModel 返回服务端 authoritative configOptions
// ============================================================

// 类型名加 Ai 前缀：zcode-task-types-core.ts 已导出 ZCodeConfigOption，barrel 下同名
// 会被静默排除，改名保证既有消费者不被破坏。
export const zcodeAiConfigSelectValueSchema = z
  .object({ value: z.string(), name: z.string() })
  .strict();
export type ZCodeAiConfigSelectValue = z.infer<typeof zcodeAiConfigSelectValueSchema>;

export const zcodeAiConfigOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    /** mode | model | thought_level | 自定义 */
    category: z.string().optional(),
    type: z.enum(["select", "boolean"]),
    currentValue: z.union([z.string(), z.boolean()]),
    options: z.array(zcodeAiConfigSelectValueSchema).optional(),
  })
  .strict();
export type ZCodeAiConfigOption = z.infer<typeof zcodeAiConfigOptionSchema>;

export const zcodeAiConfigOptionsResultSchema = z.array(zcodeAiConfigOptionSchema);

// ============================================================
// AI 侧紧凑快照视图
// ============================================================

/**
 * AI 编排视角的会话状态。对齐 zcodeSessionStatusSchema（6 值）——没有 stopped：
 * stopGeneration 后会话回到 idle，不存在 stopped 这个 session 状态。
 * host 映射时从 session projection 读，不读 task persist 3 值（会塌缩 waiting/paused）。
 */
export const zcodeAiTaskStatusSchema = z.enum([
  "idle",
  "running",
  "waiting",
  "paused",
  "completed",
  "error",
]);
export type ZCodeAiTaskStatus = z.infer<typeof zcodeAiTaskStatusSchema>;

export const zcodeAiTaskMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ZCodeAiTaskMessage = z.infer<typeof zcodeAiTaskMessageSchema>;

/**
 * task/getTaskSnapshot 的 AI 视图。字段除 taskId/status 外全部 optional，
 * host 映射时缺什么就少给什么，不为填满 schema 而伪造值。
 */
export const zcodeAiTaskSnapshotSchema = z
  .object({
    taskId: nonEmptyStringSchema,
    title: z.string().optional(),
    status: zcodeAiTaskStatusSchema,
    turnCount: z.number().int().nonnegative().optional(),
    totalTokenCount: z.number().int().nonnegative().optional(),
    contextUsed: z.number().int().nonnegative().optional(),
    contextWindow: z.number().int().nonnegative().optional(),
    recentMessages: z.array(zcodeAiTaskMessageSchema).optional(),
    recentToolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
    pendingPermissions: z.array(z.record(z.string(), z.unknown())).optional(),
    lastError: z.string().optional(),
  })
  .strict();
export type ZCodeAiTaskSnapshot = z.infer<typeof zcodeAiTaskSnapshotSchema>;

// ============================================================
// Task 反向请求：params / result
// ============================================================

export const zcodeTaskCreateTaskParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    mode: zcodeTaskModeSchema.optional(),
    modelSelection: modelSelectionSchema.optional(),
    model: nonEmptyStringSchema.optional(),
    thoughtLevel: nonEmptyStringSchema.optional(),
    draftSessionId: nonEmptyStringSchema.optional(),
    forkedFromTaskId: nonEmptyStringSchema.optional(),
    automationId: nonEmptyStringSchema.optional(),
    offPeakTaskId: nonEmptyStringSchema.optional(),
    deferPersistenceUntilFirstPrompt: z.boolean().optional(),
    v4Create: z.boolean().optional(),
  })
  .strict();
export type ZCodeTaskCreateTaskParams = z.infer<typeof zcodeTaskCreateTaskParamsSchema>;

/** ZCodeTaskCreateResult extends ZCodeTaskMeta，initialSlashCommands 为可选字段。 */
export const zcodeTaskCreateTaskResultSchema = zcodeTaskMetaSchema.extend({
  initialSlashCommands: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type ZCodeAiTaskCreateResult = z.infer<typeof zcodeTaskCreateTaskResultSchema>;

export const zcodeTaskSendPromptParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    traceId: nonEmptyStringSchema,
    queryId: nonEmptyStringSchema.optional(),
    messageId: nonEmptyStringSchema.optional(),
    content: z.string(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    clientId: nonEmptyStringSchema.optional(),
    clientLabel: nonEmptyStringSchema.optional(),
    toolDenylist: z.array(z.string()).optional(),
    modelSelection: modelSelectionSchema.optional(),
  })
  .strict();
export type ZCodeTaskSendPromptParams = z.infer<typeof zcodeTaskSendPromptParamsSchema>;

/** Host 已把 AI 编排输入提交给目标 session 的 V4 CommandInbox；不是 turn 终态。 */
export const zcodeAiTaskPromptAdmissionSchema = z
  .object({
    messageId: nonEmptyStringSchema,
    turnId: nonEmptyStringSchema,
    acceptedAt: z.number().int().nonnegative(),
    deduplicated: z.boolean(),
  })
  .strict();
export type ZCodeAiTaskPromptAdmission = z.infer<typeof zcodeAiTaskPromptAdmissionSchema>;

export const zcodeTaskGetTaskSnapshotParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    messageLimit: z.number().int().positive().optional(),
    byteBudget: z.number().int().positive().optional(),
    toolLimit: z.number().int().positive().optional(),
    resumeModelPolicy: z.enum(["task-index", "ui-resolved-only"]).optional(),
    model: nonEmptyStringSchema.optional(),
    thoughtLevel: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ZCodeTaskGetTaskSnapshotParams = z.infer<typeof zcodeTaskGetTaskSnapshotParamsSchema>;

/** 原始快照可能不存在（task 已删除或未落盘），映射层返回 null。 */
export const zcodeTaskGetTaskSnapshotResultSchema = z.union([
  zcodeAiTaskSnapshotSchema,
  z.literal(null),
]);
export type ZCodeAiTaskSnapshotResult = z.infer<typeof zcodeTaskGetTaskSnapshotResultSchema>;

export const zcodeTaskStopGenerationParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    runId: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ZCodeTaskStopGenerationParams = z.infer<typeof zcodeTaskStopGenerationParamsSchema>;

export const zcodeTaskSetModelParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    traceId: nonEmptyStringSchema,
    modelSelection: modelSelectionSchema,
  })
  .strict();
export type ZCodeTaskSetModelParams = z.infer<typeof zcodeTaskSetModelParamsSchema>;

export const zcodeTaskCompactSessionParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    inputId: nonEmptyStringSchema.optional(),
    instructions: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ZCodeTaskCompactSessionParams = z.infer<typeof zcodeTaskCompactSessionParamsSchema>;

export const zcodeTaskResumeTaskParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    taskId: nonEmptyStringSchema,
    mode: zcodeTaskModeSchema.optional(),
    model: nonEmptyStringSchema.optional(),
    thoughtLevel: nonEmptyStringSchema.optional(),
    automationId: nonEmptyStringSchema.optional(),
    offPeakTaskId: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ZCodeTaskResumeTaskParams = z.infer<typeof zcodeTaskResumeTaskParamsSchema>;

export const zcodeTaskListTasksParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({})
  .strict();
export type ZCodeTaskListTasksParams = z.infer<typeof zcodeTaskListTasksParamsSchema>;

/** 列表只给 AI 需要的字段，避免每个 task 的完整 meta 挤占 token。 */
export const zcodeAiTaskMetaListEntrySchema = zcodeTaskMetaSchema
  .pick({
    taskId: true,
    title: true,
    status: true,
    mode: true,
    model: true,
    workspacePath: true,
    workspaceIdentity: true,
    createdAt: true,
    updatedAt: true,
    traceId: true,
  })
  .strict();
export type ZCodeAiTaskMetaListEntry = z.infer<typeof zcodeAiTaskMetaListEntrySchema>;

export const zcodeTaskListTasksResultSchema = z.array(zcodeAiTaskMetaListEntrySchema);

// ============================================================
// Session 反向请求：params / result
// ============================================================

export const zcodeSessionReadSessionParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    targetSessionId: nonEmptyStringSchema,
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ZCodeSessionReadSessionParams = z.infer<typeof zcodeSessionReadSessionParamsSchema>;
export const zcodeSessionReadSessionResultSchema = zcodeSessionStateSnapshotSchema;

export const zcodeSessionListSessionsParamsSchema = zcodeAiOrchestrationRequestContextSchema
  .extend({
    includeArchived: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type ZCodeSessionListSessionsParams = z.infer<typeof zcodeSessionListSessionsParamsSchema>;
export const zcodeSessionListSessionsResultSchema = z.array(zcodeSessionInfoSchema);

// ============================================================
// stopGeneration 无返回体；sendPrompt 返回 admission 回执
// ============================================================

export const zcodeTaskCompactSessionResultSchema = zcodeSessionCompactResultSchema;
export type ZCodeAiTaskCompactResult = z.infer<typeof zcodeTaskCompactSessionResultSchema>;

export const zcodeTaskResumeTaskResultSchema = zcodeTaskMetaSchema;
export const zcodeTaskSetModelResultSchema = zcodeAiConfigOptionsResultSchema;
export const zcodeTaskSendPromptResultSchema = zcodeAiTaskPromptAdmissionSchema;

// ============================================================
// stopGeneration 空结果
// ============================================================

export const zcodeAiTaskVoidResultSchema = zcodeProtocolEmptyResultSchema;
export type ZCodeAiTaskVoidResult = z.infer<typeof zcodeAiTaskVoidResultSchema>;
