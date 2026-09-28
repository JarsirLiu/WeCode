// ============================================================
// StopSessionGeneration Tool Handler
// ============================================================
//
// AI 会话编排：停止当前正在进行的生成（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask），纯 CLI 无 ZCodeTaskPort 时不存在。

import {
  STOP_SESSION_GENERATION_TOOL_NAME,
  STOP_SESSION_GENERATION_DESCRIPTION,
  StopSessionGenerationInputJsonSchema,
  StopSessionGenerationOutputJsonSchema,
  StopSessionGenerationInputSchema,
  StopSessionGenerationOutputSchema,
  CoreErrorType,
  createCoreError,
  type StopSessionGenerationOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_STOP_SESSION_GENERATION_BYTES = 10_000;
const STOP_SESSION_GENERATION_TIMEOUT_MS = 10_000;

const stopSessionGenerationHandler: ToolHandler = async (input, context) => {
  const parsed = StopSessionGenerationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid StopSessionGeneration input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: STOP_SESSION_GENERATION_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: STOP_SESSION_GENERATION_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  await context.zcodeTaskPort.stopGeneration({
    taskId: parsed.data.taskId,
    runId: parsed.data.runId,
    workspacePath: undefined,
    workspaceIdentity: undefined,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
  return {} as StopSessionGenerationOutput;
};

export const stopSessionGenerationToolEntry: ToolEntry = {
  capability: "Stop the currently running generation in a ZCode session/task",
  metadata: {
    name: STOP_SESSION_GENERATION_TOOL_NAME,
    description: STOP_SESSION_GENERATION_DESCRIPTION,
    readOnly: false,
    destructive: true,
    concurrentSafe: false,
    timeoutMs: STOP_SESSION_GENERATION_TIMEOUT_MS,
    maxOutputBytes: MAX_STOP_SESSION_GENERATION_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: false,
  },
  handler: stopSessionGenerationHandler,
  inputSchema: StopSessionGenerationInputJsonSchema,
  outputSchema: StopSessionGenerationOutputJsonSchema,
  runtimeInputSchema: StopSessionGenerationInputSchema,
  runtimeOutputSchema: StopSessionGenerationOutputSchema,
  permission: {
    permission: "zcode.task.stop",
    reason: "StopSessionGeneration interrupts a running ZCode session generation",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_STOP_SESSION_GENERATION_BYTES,
    maxModelBytes: MAX_STOP_SESSION_GENERATION_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_STOP_SESSION_GENERATION_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: STOP_SESSION_GENERATION_TIMEOUT_MS,
    maxMs: STOP_SESSION_GENERATION_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "StopSessionGeneration was cancelled before the host confirmed the stop",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};