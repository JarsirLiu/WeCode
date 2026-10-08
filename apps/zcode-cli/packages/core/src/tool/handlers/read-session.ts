// ============================================================
// ReadSession Tool Handler
// ============================================================
//
// AI 会话编排：读取 ZCode session 完整状态（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask + includeZCodeSession），纯 CLI 无端口时不存在。

import {
  READ_SESSION_TOOL_NAME,
  READ_SESSION_DESCRIPTION,
  ReadSessionInputJsonSchema,
  ReadSessionOutputJsonSchema,
  ReadSessionInputSchema,
  ReadSessionOutputSchema,
  CoreErrorType,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import { summarizeReadSessionOutput } from "./read-session-summary.js";

const MAX_READ_SESSION_BYTES = 200_000;
const READ_SESSION_TIMEOUT_MS = 15_000;
const DEFAULT_MESSAGE_LIMIT = 50;

const readSessionHandler: ToolHandler = async (input, context) => {
  const parsed = ReadSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid ReadSession input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: READ_SESSION_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  // 优先使用 zcodeSessionPort（完整快照），回退到 zcodeTaskPort.getTaskSnapshot（紧凑快照）
  if (context.zcodeSessionPort) {
    // targetSessionId 是目标会话（要读的），sessionId 是调用方——两者不同，不碰撞。
    const snapshot = await context.zcodeSessionPort.readSession({
      targetSessionId: parsed.data.sessionId,
      workspacePath: "", // 由 broker 从受信 session record 覆盖
      messageLimit: parsed.data.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
      afterSeq: parsed.data.afterSeq,
      sessionId: context.sessionId,
      traceContext: context.traceContext,
      signal: context.abortSignal,
    });
    return summarizeReadSessionOutput(snapshot);
  }
  if (context.zcodeTaskPort) {
    const snapshot = await context.zcodeTaskPort.getTaskSnapshot({
      taskId: parsed.data.sessionId,
      workspacePath: "", // 由 broker 从受信 session record 覆盖
      messageLimit: parsed.data.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
      sessionId: context.sessionId,
      traceContext: context.traceContext,
      signal: context.abortSignal,
    });
    return summarizeReadSessionOutput(snapshot);
  }
  throw createCoreError(
    CoreErrorType.ToolExecutionFailed,
    "ZCode Session service is not available in this session",
    {
      context: { toolCallId: context.toolCallId, toolName: READ_SESSION_TOOL_NAME },
      recoverable: true,
    },
  );
};

export const readSessionToolEntry: ToolEntry = {
  capability: "Read a compact summary of a ZCode session without full tool inputs or outputs",
  metadata: {
    name: READ_SESSION_TOOL_NAME,
    description: READ_SESSION_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: READ_SESSION_TIMEOUT_MS,
    maxOutputBytes: MAX_READ_SESSION_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: readSessionHandler,
  inputSchema: ReadSessionInputJsonSchema,
  outputSchema: ReadSessionOutputJsonSchema,
  runtimeInputSchema: ReadSessionInputSchema,
  runtimeOutputSchema: ReadSessionOutputSchema,
  permission: {
    permission: "zcode.session.read",
    reason: "ReadSession reads session state (history, runtime, todos)",
    riskLevel: "low",
    sideEffectScope: "workspace",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_READ_SESSION_BYTES,
    maxModelBytes: MAX_READ_SESSION_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_READ_SESSION_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: READ_SESSION_TIMEOUT_MS,
    maxMs: READ_SESSION_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "ReadSession was cancelled before the host returned the snapshot",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
