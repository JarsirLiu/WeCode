// ============================================================
// SendSessionMessage Tool Handler
// ============================================================
//
// AI 会话编排：向已有 ZCode session 发送消息（spec: docs/specs/ai-session-orchestration.md）。
// 端口在场即注册（includeZCodeTask），纯 CLI 无 ZCodeTaskPort 时不存在。

import {
  SEND_SESSION_MESSAGE_TOOL_NAME,
  SEND_SESSION_MESSAGE_DESCRIPTION,
  SendSessionMessageInputJsonSchema,
  SendSessionMessageOutputJsonSchema,
  SendSessionMessageInputSchema,
  SendSessionMessageOutputSchema,
  CoreErrorType,
  createCoreError,
} from "@zcode/contracts";
import type { ModelSelection } from "@zcode/shared";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_SEND_SESSION_MESSAGE_BYTES = 50_000;
const SEND_SESSION_MESSAGE_TIMEOUT_MS = 30_000;

const sendSessionMessageHandler: ToolHandler = async (input, context) => {
  const parsed = SendSessionMessageInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid SendSessionMessage input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: SEND_SESSION_MESSAGE_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: SEND_SESSION_MESSAGE_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  if (parsed.data.attachments?.length) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "SendSessionMessage does not support attachments until V4 attachment admission is available",
      {
        context: { toolCallId: context.toolCallId, toolName: SEND_SESSION_MESSAGE_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  const messageId = parsed.data.messageId ?? crypto.randomUUID();
  const admission = await context.zcodeTaskPort.sendPrompt({
    taskId: parsed.data.taskId,
    content: parsed.data.content,
    traceId: parsed.data.traceId,
    queryId: parsed.data.queryId,
    messageId,
    clientId: parsed.data.clientId,
    clientLabel: parsed.data.clientLabel,
    toolDenylist: parsed.data.toolDenylist,
    modelSelection: parsed.data.modelSelection as ModelSelection | undefined,
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
  return admission;
};

export const sendSessionMessageToolEntry: ToolEntry = {
  capability: "Send a message to an existing ZCode session/task for AI orchestration",
  metadata: {
    name: SEND_SESSION_MESSAGE_TOOL_NAME,
    description: SEND_SESSION_MESSAGE_DESCRIPTION,
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: SEND_SESSION_MESSAGE_TIMEOUT_MS,
    maxOutputBytes: MAX_SEND_SESSION_MESSAGE_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: false, // 发送消息不需要审批，只有敏感操作才需要
  },
  handler: sendSessionMessageHandler,
  inputSchema: SendSessionMessageInputJsonSchema,
  outputSchema: SendSessionMessageOutputJsonSchema,
  runtimeInputSchema: SendSessionMessageInputSchema,
  runtimeOutputSchema: SendSessionMessageOutputSchema,
  permission: {
    permission: "zcode.task.send",
    reason: "SendSessionMessage delivers a prompt to an existing ZCode session",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_SEND_SESSION_MESSAGE_BYTES,
    maxModelBytes: MAX_SEND_SESSION_MESSAGE_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_SEND_SESSION_MESSAGE_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: SEND_SESSION_MESSAGE_TIMEOUT_MS,
    maxMs: SEND_SESSION_MESSAGE_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "SendSessionMessage was cancelled before the host accepted the message",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
