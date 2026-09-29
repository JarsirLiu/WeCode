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
import type { ModelSelection } from "@zcode/shared";
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
  return context.zcodeTaskPort.createTask({
    workspacePath: parsed.data.workspacePath,
    workspaceIdentity: parsed.data.workspaceIdentity,
    mode: parsed.data.mode,
    modelSelection: parsed.data.modelSelection as ModelSelection | undefined,
    model: parsed.data.model,
    thoughtLevel: parsed.data.thoughtLevel,
    draftSessionId: parsed.data.draftSessionId,
    forkedFromTaskId: parsed.data.forkedFromTaskId,
    automationId: parsed.data.automationId,
    offPeakTaskId: parsed.data.offPeakTaskId,
    approvalPolicy: parsed.data.approvalPolicy,
    deferPersistenceUntilFirstPrompt: false,
    v4Create: false,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
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
