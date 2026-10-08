// ============================================================
// ListSessions Tool Handler
// ============================================================
//
// 列出工作区下的所有会话，供用户选择继续或新建。
// spec: docs/specs/features/mcp-server-support.md
// 透传 ZCodeSessionPort.listSessions -> broker session/listSessions -> IZCodeSessionService.listSessions

import {
  LIST_SESSIONS_TOOL_NAME,
  LIST_SESSIONS_DESCRIPTION,
  ListSessionsInputJsonSchema,
  ListSessionsOutputJsonSchema,
  ListSessionsInputSchema,
  ListSessionsOutputSchema,
  CoreErrorType,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import type { ZCodeSessionInfo } from "@zcode/shared";

const MAX_LIST_SESSIONS_BYTES = 50_000;
const LIST_SESSIONS_TIMEOUT_MS = 10_000;

const listSessionsHandler: ToolHandler = async (input, context) => {
  const parsed = ListSessionsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid ListSessions input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: LIST_SESSIONS_TOOL_NAME,
      },
      recoverable: true,
    });
  }

  // 需要通过 zcodeSessionPort 访问 session service
  if (!context.zcodeSessionPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Session service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: LIST_SESSIONS_TOOL_NAME },
        recoverable: true,
      },
    );
  }

  const { workspaceIdentity, workspacePath, includeArchived = false, limit = 50 } = parsed.data;

  const sessions = await context.zcodeSessionPort.listSessions({
    workspaceIdentity,
    workspacePath: workspacePath ?? "",
    includeArchived,
    limit,
    sessionId: context.sessionId,
  });

  // Port 返回共享协议的 ZCodeSessionInfo；工具契约只暴露稳定的扁平摘要，不能直接透传
  // workspace/sessionKind 等协议字段，否则 runtimeOutputSchema 会在边界处拒绝结果。
  return {
    sessions: sessions.map((session: ZCodeSessionInfo) => ({
      sessionId: session.sessionId,
      workspacePath: session.workspace.workspacePath,
      title: session.title,
      status: session.status,
      mode: session.mode,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
    })),
  };
};

export const listSessionsToolEntry: ToolEntry = {
  capability: "List all sessions in a workspace for AI session orchestration",
  metadata: {
    name: LIST_SESSIONS_TOOL_NAME,
    description: LIST_SESSIONS_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: LIST_SESSIONS_TIMEOUT_MS,
    maxOutputBytes: MAX_LIST_SESSIONS_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: listSessionsHandler,
  inputSchema: ListSessionsInputJsonSchema,
  outputSchema: ListSessionsOutputJsonSchema,
  runtimeInputSchema: ListSessionsInputSchema,
  runtimeOutputSchema: ListSessionsOutputSchema,
  permission: {
    permission: "zcode.session.list",
    reason: "ListSessions reads existing session information",
    riskLevel: "low",
    sideEffectScope: "workspace",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_LIST_SESSIONS_BYTES,
    maxModelBytes: MAX_LIST_SESSIONS_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_LIST_SESSIONS_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: LIST_SESSIONS_TIMEOUT_MS,
    maxMs: LIST_SESSIONS_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "ListSessions was cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
