// Lists the Host-owned workspace index for AI session orchestration.

import {
  WORKSPACE_LIST_TOOL_NAME,
  WORKSPACE_LIST_DESCRIPTION,
  WorkspaceListInputJsonSchema,
  WorkspaceListOutputJsonSchema,
  WorkspaceListInputSchema,
  WorkspaceListOutputSchema,
  CoreErrorType,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_WORKSPACE_LIST_BYTES = 50_000;
const WORKSPACE_LIST_TIMEOUT_MS = 10_000;

const workspaceListHandler: ToolHandler = async (input, context) => {
  const parsed = WorkspaceListInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid WorkspaceList input", {
      context: {
        issues: parsed.error.issues.map(
          (issue: { message: string; path: (string | number)[] }) => ({
            message: issue.message,
            path: issue.path,
          }),
        ),
        toolCallId: context.toolCallId,
        toolName: WORKSPACE_LIST_TOOL_NAME,
      },
      recoverable: true,
    });
  }

  if (!context.workspaceIndexPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "Host workspace index is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: WORKSPACE_LIST_TOOL_NAME },
        recoverable: true,
      },
    );
  }

  const hostWorkspaces = await context.workspaceIndexPort.listWorkspaces({
    sessionId: context.sessionId,
    traceContext: context.traceContext,
    signal: context.abortSignal,
  });
  return {
    workspaces: hostWorkspaces.map((workspace) => ({
      ...workspace,
      workspaceIdentity: workspace.workspaceIdentity?.trim() || workspace.workspacePath,
    })),
  };
};

export const workspaceListToolEntry: ToolEntry = {
  capability: "List all known workspaces (local and remote) for AI session orchestration",
  metadata: {
    name: WORKSPACE_LIST_TOOL_NAME,
    description: WORKSPACE_LIST_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: WORKSPACE_LIST_TIMEOUT_MS,
    maxOutputBytes: MAX_WORKSPACE_LIST_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: workspaceListHandler,
  inputSchema: WorkspaceListInputJsonSchema,
  outputSchema: WorkspaceListOutputJsonSchema,
  runtimeInputSchema: WorkspaceListInputSchema,
  runtimeOutputSchema: WorkspaceListOutputSchema,
  permission: {
    permission: "zcode.workspace.list",
    reason: "WorkspaceList reads existing workspace information",
    riskLevel: "low",
    sideEffectScope: "workspace",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_WORKSPACE_LIST_BYTES,
    maxModelBytes: MAX_WORKSPACE_LIST_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_WORKSPACE_LIST_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: WORKSPACE_LIST_TIMEOUT_MS,
    maxMs: WORKSPACE_LIST_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "WorkspaceList was cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
