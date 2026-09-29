// ============================================================
// CompactSession Tool Handler
// ============================================================
//
// AI 会话编排：执行内建 /compact 命令压缩上下文（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask），纯 CLI 无 ZCodeTaskPort 时不存在。

import {
  COMPACT_SESSION_TOOL_NAME,
  COMPACT_SESSION_DESCRIPTION,
  CompactSessionInputJsonSchema,
  CompactSessionOutputJsonSchema,
  CompactSessionInputSchema,
  CompactSessionOutputSchema,
  CoreErrorType,
  createCoreError,
  type CompactSessionOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_COMPACT_SESSION_BYTES = 200_000;
const COMPACT_SESSION_TIMEOUT_MS = 60_000;

const compactSessionHandler: ToolHandler = async (input, context) => {
  const parsed = CompactSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid CompactSession input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: COMPACT_SESSION_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: COMPACT_SESSION_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  return context.zcodeTaskPort.compactSession({
    taskId: parsed.data.taskId,
    inputId: parsed.data.inputId,
    workspacePath: undefined,
    workspaceIdentity: undefined,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  }) as Promise<CompactSessionOutput>;
};

export const compactSessionToolEntry: ToolEntry = {
  capability: "Execute the built-in /compact command on a ZCode session/task to summarize and reduce context",
  metadata: {
    name: COMPACT_SESSION_TOOL_NAME,
    description: COMPACT_SESSION_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: COMPACT_SESSION_TIMEOUT_MS,
    maxOutputBytes: MAX_COMPACT_SESSION_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: compactSessionHandler,
  inputSchema: CompactSessionInputJsonSchema,
  outputSchema: CompactSessionOutputJsonSchema,
  runtimeInputSchema: CompactSessionInputSchema,
  runtimeOutputSchema: CompactSessionOutputSchema,
  permission: {
    permission: "zcode.task.compact",
    reason: "CompactSession runs the /compact command to reduce session context",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_COMPACT_SESSION_BYTES,
    maxModelBytes: MAX_COMPACT_SESSION_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_COMPACT_SESSION_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: COMPACT_SESSION_TIMEOUT_MS,
    maxMs: COMPACT_SESSION_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "CompactSession was cancelled before the host returned the result",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
