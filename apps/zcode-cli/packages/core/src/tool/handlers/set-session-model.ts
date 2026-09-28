// ============================================================
// SetSessionModel Tool Handler
// ============================================================
//
// AI 会话编排：切换 ZCode session/task 的模型（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask），纯 CLI 无 ZCodeTaskPort 时不存在。

import {
  SET_SESSION_MODEL_TOOL_NAME,
  SET_SESSION_MODEL_DESCRIPTION,
  SetSessionModelInputJsonSchema,
  SetSessionModelOutputJsonSchema,
  SetSessionModelInputSchema,
  SetSessionModelOutputSchema,
  CoreErrorType,
  createCoreError,
  type SetSessionModelOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_SET_SESSION_MODEL_BYTES = 50_000;
const SET_SESSION_MODEL_TIMEOUT_MS = 15_000;

const setSessionModelHandler: ToolHandler = async (input, context) => {
  const parsed = SetSessionModelInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid SetSessionModel input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: SET_SESSION_MODEL_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: SET_SESSION_MODEL_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  return context.zcodeTaskPort.setModel({
    taskId: parsed.data.taskId,
    traceId: parsed.data.traceId,
    modelSelection: parsed.data.modelSelection as any,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  }) as Promise<SetSessionModelOutput>;
};

export const setSessionModelToolEntry: ToolEntry = {
  capability: "Change the model for a ZCode session/task, returns authoritative configOptions",
  metadata: {
    name: SET_SESSION_MODEL_TOOL_NAME,
    description: SET_SESSION_MODEL_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: SET_SESSION_MODEL_TIMEOUT_MS,
    maxOutputBytes: MAX_SET_SESSION_MODEL_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: setSessionModelHandler,
  inputSchema: SetSessionModelInputJsonSchema,
  outputSchema: SetSessionModelOutputJsonSchema,
  runtimeInputSchema: SetSessionModelInputSchema,
  runtimeOutputSchema: SetSessionModelOutputSchema,
  permission: {
    permission: "zcode.task.set_model",
    reason: "SetSessionModel changes the model for a ZCode session",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_SET_SESSION_MODEL_BYTES,
    maxModelBytes: MAX_SET_SESSION_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_SET_SESSION_MODEL_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: SET_SESSION_MODEL_TIMEOUT_MS,
    maxMs: SET_SESSION_MODEL_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "SetSessionModel was cancelled before the host confirmed the change",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};