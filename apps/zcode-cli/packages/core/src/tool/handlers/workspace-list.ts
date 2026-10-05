// ============================================================
// WorkspaceList Tool Handler
// ============================================================
//
// 列出已知工作区（本地 + 远程），供用户选择后传给 create_session。
// spec: docs/specs/features/mcp-server-support.md

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

function hashWorkspacePath(path: string): string {
  // 与 broker 保持一致的简单哈希
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function detectProjectType(workspacePath: string): "node" | "python" | "go" | "rust" | "unknown" {
  // 简单的项目类型检测，后续可复用现有逻辑
  return "unknown";
}

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

  // 需要通过 zcodeTaskPort 访问 task service
  if (!context.zcodeTaskPort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "ZCode Task service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: WORKSPACE_LIST_TOOL_NAME },
        recoverable: true,
      },
    );
  }

  // 1. 获取本地工作区：通过 listTasks 聚合
  const localTasks = await context.zcodeTaskPort.listTasks({
    workspacePath: process.cwd(),
    sessionId: context.sessionId,
  });

  // 按 workspacePath 聚合
  const localWorkspaceMap = new Map<string, typeof localTasks>();
  for (const task of localTasks) {
    const key = task.workspacePath;
    if (!localWorkspaceMap.has(key)) {
      localWorkspaceMap.set(key, []);
    }
    localWorkspaceMap.get(key)!.push(task);
  }

  const workspaces: Array<{
    workspaceIdentity: string;
    workspacePath: string;
    label: string;
    kind: "local" | "remote";
    projectType: "node" | "python" | "go" | "rust" | "unknown";
    lastActiveAt: number;
    activeSessionCount: number;
  }> = [];

  for (const [workspacePath, tasks] of localWorkspaceMap) {
    const workspaceIdentity = hashWorkspacePath(workspacePath);
    const lastActiveAt = Math.max(...tasks.map((t) => t.updatedAt));
    const activeSessionCount = tasks.filter((t) => t.status === "running").length;

    workspaces.push({
      workspaceIdentity,
      workspacePath,
      label: workspacePath.split(/[/\\]/).pop() || workspacePath,
      kind: "local",
      projectType: detectProjectType(workspacePath),
      lastActiveAt,
      activeSessionCount,
    });
  }

  // 2. 远程工作区：当前只有在 Desktop Host 运行时才有 windowRemoteConnectionRegistry
  // 暂时留空，后续通过 broker 注入

  // 按 lastActiveAt 降序排序
  workspaces.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  return {
    workspaces,
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
