// ============================================================
// CreateSession Tool Handler
// ============================================================
//
// AI 会话编排：创建新的 ZCode session/task（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask），纯 CLI 无 ZCodeTaskPort 时不存在。

import {
  CREATE_SESSION_TOOL_NAME,
  CREATE_SESSION_DESCRIPTION,
  CreateSessionInputJsonSchema,
  CreateSessionOutputJsonSchema,
  CreateSessionInputSchema,
  CreateSessionOutputSchema,
  CoreErrorType,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_CREATE_SESSION_BYTES = 50_000;
const CREATE_SESSION_TIMEOUT_MS = 30_000;

const createSessionHandler: ToolHandler = async (input, context) => {
  const parsed = CreateSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid CreateSession input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: CREATE_SESSION_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: CREATE_SESSION_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  const result = await context.zcodeTaskPort.createTask({
    workspacePath: parsed.data.workspacePath,
    workspaceIdentity: parsed.data.workspaceIdentity,
    mode: parsed.data.mode ?? "yolo",
    draftSessionId: parsed.data.draftSessionId,
    forkedFromTaskId: parsed.data.forkedFromTaskId,
    automationId: parsed.data.automationId,
    offPeakTaskId: parsed.data.offPeakTaskId,
    deferPersistenceUntilFirstPrompt: false,
    // 创建和 sendPrompt 必须使用同一套 V4 session/runtime 记录；旧 session/create
    // 不会建立 V4 CommandInbox 所需的持久化关系，随后发送会触发外键错误。
    v4Create: true,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
  await context.zcodeTaskPort.sendPrompt({
    taskId: result.taskId,
    traceId: result.traceId,
    messageId: crypto.randomUUID(),
    content: parsed.data.content,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
  // Host 返回完整 task meta；工具契约只公开创建结果字段，逐字段投影避免内部索引字段
  // 触发 strict runtimeOutputSchema 校验失败。
  return {
    taskId: result.taskId,
    traceId: result.traceId,
    title: result.title,
    workspacePath: result.workspacePath,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    mode: result.mode,
    ...(result.titleOverridden === undefined ? {} : { titleOverridden: result.titleOverridden }),
    ...(result.workspaceIdentity === undefined
      ? {}
      : { workspaceIdentity: result.workspaceIdentity }),
    ...(result.workspacePurpose === undefined ? {} : { workspacePurpose: result.workspacePurpose }),
    ...(result.model === undefined ? {} : { model: result.model }),
    ...(result.thoughtLevel === undefined ? {} : { thoughtLevel: result.thoughtLevel }),
    ...(result.runtimeEpoch === undefined ? {} : { runtimeEpoch: result.runtimeEpoch }),
    ...(result.initialSlashCommands === undefined
      ? {}
      : { initialSlashCommands: result.initialSlashCommands }),
  };
};

export const createSessionToolEntry: ToolEntry = {
  capability: "Create a new ZCode session/task in a workspace for AI orchestration",
  metadata: {
    name: CREATE_SESSION_TOOL_NAME,
    description: CREATE_SESSION_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: CREATE_SESSION_TIMEOUT_MS,
    maxOutputBytes: MAX_CREATE_SESSION_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: createSessionHandler,
  inputSchema: CreateSessionInputJsonSchema,
  outputSchema: CreateSessionOutputJsonSchema,
  runtimeInputSchema: CreateSessionInputSchema,
  runtimeOutputSchema: CreateSessionOutputSchema,
  permission: {
    permission: "zcode.task.create",
    reason: "CreateSession creates a new persistent ZCode session/task",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_CREATE_SESSION_BYTES,
    maxModelBytes: MAX_CREATE_SESSION_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_CREATE_SESSION_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: CREATE_SESSION_TIMEOUT_MS,
    maxMs: CREATE_SESSION_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "CreateSession was cancelled before the host confirmed creation",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
