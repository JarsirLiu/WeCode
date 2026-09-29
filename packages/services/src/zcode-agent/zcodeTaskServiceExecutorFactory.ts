// ============================================================
// ZCodeTaskServiceExecutor 工厂：lazy 闭包读取 IZCodeTaskService / IZCodeSessionService
// ============================================================
//
// 与 createBotsCommandServiceExecutor 同模式：不持有可变状态，延迟解析 services。
// 反向请求到达时 services 已完成装配。身份/路由字段已在 zcodeAgentService 里按
// zcodeAiOrchestrationRequestContextSchema 解析并注入；executor 只做 wire→service 映射。
//
// 注意：attachments 在 wire schema 里是 z.record(z.string(), z.unknown())（JSON 边界），
// service 期望 ZCodePromptAttachment[]。safeParse 已做 .strict() 校验，这里用类型断言
// 跨 JSON→typed 边界，不是 as any 掩盖不匹配。

import type {
  ZCodeAiTaskSnapshot,
  ZCodePromptAttachment,
  ZCodeTaskClientMode,
} from "@zcode/shared";
import type { IZCodeTaskService } from "../session/zcodeTaskService.js";
import type { IZCodeSessionService } from "../zcode-session/zcodeSession.js";
import type { ZCodeTaskServiceExecutor } from "./zcodeTaskCommandExecutor.js";

export function createZCodeTaskServiceExecutor(options: {
  readZCodeTaskService: () => IZCodeTaskService | undefined;
  readZCodeSessionService: () => IZCodeSessionService | undefined;
}): ZCodeTaskServiceExecutor {
  const task = (): IZCodeTaskService => {
    const svc = options.readZCodeTaskService();
    if (!svc) throw new Error("zcode task service not available");
    return svc;
  };
  const session = (): IZCodeSessionService => {
    const svc = options.readZCodeSessionService();
    if (!svc) throw new Error("zcode session service not available");
    return svc;
  };

  return {
    createTask: (input) =>
      task().createTask({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.thoughtLevel ? { thoughtLevel: input.thoughtLevel } : {}),
        ...(input.draftSessionId ? { draftSessionId: input.draftSessionId } : {}),
        ...(input.forkedFromTaskId ? { forkedFromTaskId: input.forkedFromTaskId } : {}),
        ...(input.automationId ? { automationId: input.automationId } : {}),
        ...(input.offPeakTaskId ? { offPeakTaskId: input.offPeakTaskId } : {}),
        ...(input.deferPersistenceUntilFirstPrompt !== undefined
          ? { deferPersistenceUntilFirstPrompt: input.deferPersistenceUntilFirstPrompt }
          : {}),
        ...(input.v4Create !== undefined ? { v4Create: input.v4Create } : {}),
        peerSessionRelation: {
          creatorSessionId: input.creatorSessionId,
          approvalPolicy: input.approvalPolicy ?? "manual",
          ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        },
      }),

    sendPrompt: (input) =>
      task().sendPrompt({
        taskId: input.taskId,
        traceId: input.traceId,
        content: input.content,
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        ...(input.queryId ? { queryId: input.queryId } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.attachments
          ? { attachments: input.attachments as unknown as ZCodePromptAttachment[] }
          : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.clientLabel ? { clientLabel: input.clientLabel } : {}),
        ...(input.clientMode ? { clientMode: input.clientMode as ZCodeTaskClientMode } : {}),
        ...(input.toolDenylist ? { toolDenylist: input.toolDenylist } : {}),
        ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
      }),

    stopGeneration: (input) =>
      task().stopGeneration({
        taskId: input.taskId,
        ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      }),

    compactSession: (input) =>
      task().compactSession({
        taskId: input.taskId,
        ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.inputId ? { inputId: input.inputId } : {}),
        ...(input.instructions ? { instructions: input.instructions } : {}),
        ...(input.expectedRevision !== undefined
          ? { expectedRevision: input.expectedRevision }
          : {}),
      }),

    resumeTask: (input) =>
      task().resumeTask({
        taskId: input.taskId,
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.thoughtLevel ? { thoughtLevel: input.thoughtLevel } : {}),
        ...(input.automationId ? { automationId: input.automationId } : {}),
        ...(input.offPeakTaskId ? { offPeakTaskId: input.offPeakTaskId } : {}),
      }),

    listTasks: (input) =>
      task().listTasks({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
      }),

    getTaskSnapshot: async (input) => {
      // AI 紧凑快照从 session projection 读 6 值 status（spec §3.2.3），
      // 不从 task persist 的 3 值读（waiting/paused/idle 会被塌缩）。
      // session projection 已包含 turnCount/tokenCount/contextUsed/pendingPermissions，
      // 无需额外调 task service。
      const snapshot = await session().readSession({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        sessionId: input.taskId,
        messageLimit: input.messageLimit ?? 0,
      });
      if (!snapshot) return null;
      const { projection, session: info, messages } = snapshot;
      return {
        taskId: projection.sessionId,
        title: info.title,
        status: projection.status,
        turnCount: projection.turnCount,
        totalTokenCount: projection.totalTokenCount,
        contextUsed: projection.contextUsed,
        contextWindow: projection.contextWindow,
        ...(messages.length > 0
          ? {
              recentMessages: messages.slice(-Math.max(input.messageLimit ?? 5, 1)).map((m) => {
                const textParts = m.parts.filter((p) => p.type === "text");
                return {
                  role: m.info.role,
                  content: textParts.map((p) => p.text).join("\n"),
                  timestamp: m.info.time.created,
                };
              }),
            }
          : {}),
        ...(projection.pendingPermissions.length > 0
          ? { pendingPermissions: projection.pendingPermissions as Record<string, unknown>[] }
          : {}),
        ...(projection.lastError ? { lastError: projection.lastError.message } : {}),
      };
    },

    setModel: (input) =>
      task().setModel({
        taskId: input.taskId,
        traceId: input.traceId,
        modelSelection: input.modelSelection,
      }),

    readSession: (input) =>
      session().readSession({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        sessionId: input.targetSessionId,
        ...(input.messageLimit ? { messageLimit: input.messageLimit } : {}),
        ...(input.afterSeq ? { afterSeq: input.afterSeq } : {}),
      }),

    listSessions: (input) =>
      session().listSessions({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        ...(input.includeArchived ? { includeArchived: input.includeArchived } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      }),
  };
}
