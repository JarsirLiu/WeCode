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

import type { ZCodePromptAttachment, ZCodeTaskClientMode } from "@zcode/shared";
import type { IZCodeTaskService } from "../session/zcodeTaskService.js";
import type { IZCodeSessionService } from "../zcode-session/zcodeSession.js";
import type { ZCodeTaskServiceExecutor } from "./zcodeTaskCommandExecutor.js";
import { PeerSessionRelationRepo } from "../session/peerSessionRelationRepo.js";
import { PermissionResolutionError } from "./permissionResolutionError.js";
import { runPermissionResolutionWithClaim } from "./permissionResolutionClaim.js";

export function createZCodeTaskServiceExecutor(options: {
  readZCodeTaskService: () => IZCodeTaskService | undefined;
  readZCodeSessionService: () => IZCodeSessionService | undefined;
  createPeerSessionRelationRepo?: () => PeerSessionRelationRepo;
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

  const resolveManagedTarget = async (input: {
    callerSessionId: string;
    targetSessionId: string;
    callerRemoteSessionId?: string;
  }) => {
    const target = await task().resolveTaskTarget({ taskId: input.targetSessionId });
    if (input.callerSessionId === input.targetSessionId) {
      return input.callerRemoteSessionId && !target.remoteSessionId
        ? { ...target, remoteSessionId: input.callerRemoteSessionId }
        : target;
    }
    const repo = options.createPeerSessionRelationRepo?.() ?? new PeerSessionRelationRepo();
    try {
      const relation = await repo.findCreatedSession({
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        targetSessionId: input.targetSessionId,
      });
      // 普通会话管理只校验创建关系；approvalPolicy 属于目标 runtime 的权限决议策略，
      // 不能阻断 yolo 会话的发消息、读取、停止、切模型或压缩操作。
      if (!relation || relation.creatorSessionId !== input.callerSessionId) {
        throw new PermissionResolutionError(
          "not_authorized",
          "session management is not authorized for this target session",
        );
      }
      if (!target.remoteSessionId && relation.remoteSessionId) {
        return { ...target, remoteSessionId: relation.remoteSessionId };
      }
    } finally {
      repo.close();
    }
    return target;
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

    sendPrompt: async (input) => {
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.taskId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      return task().sendPrompt({
        taskId: input.taskId,
        traceId: input.traceId,
        content: input.content,
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        ...(target.remoteSessionId ? { remoteSessionId: target.remoteSessionId } : {}),
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
      });
    },

    stopGeneration: async (input) => {
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.taskId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      return task().stopGeneration({
        taskId: input.taskId,
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      });
    },

    compactSession: async (input) => {
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.taskId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      return task().compactSession({
        taskId: input.taskId,
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        ...(input.inputId ? { inputId: input.inputId } : {}),
        ...(input.instructions ? { instructions: input.instructions } : {}),
        ...(input.expectedRevision !== undefined
          ? { expectedRevision: input.expectedRevision }
          : {}),
      });
    },

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
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.taskId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      const snapshot = await session().readSession({
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
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
              recentMessages: messages.slice(-Math.max(input.messageLimit ?? 20, 1)).map((m) => {
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

    setModel: async (input) => {
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.taskId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      return task().setModel({
        taskId: input.taskId,
        traceId: input.traceId,
        modelSelection: input.modelSelection,
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        ...(target.remoteSessionId ? { remoteSessionId: target.remoteSessionId } : {}),
      });
    },

    readSession: async (input) => {
      const target = await resolveManagedTarget({
        callerSessionId: input.callerSessionId,
        targetSessionId: input.targetSessionId,
        callerRemoteSessionId: input.remoteSessionId,
      });
      return session().readSession({
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        sessionId: input.targetSessionId,
        ...(input.messageLimit ? { messageLimit: input.messageLimit } : {}),
        ...(input.afterSeq ? { afterSeq: input.afterSeq } : {}),
      });
    },

    listSessions: (input) =>
      session().listSessions({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.remoteSessionId ? { remoteSessionId: input.remoteSessionId } : {}),
        ...(input.includeArchived ? { includeArchived: input.includeArchived } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      }),

    async resolveSessionPermission(input) {
      if (input.decision === "allow_always")
        throw new PermissionResolutionError(
          "allow_always_not_supported",
          "allow_always is not supported for delegated session permissions",
        );
      const target = await resolveManagedTarget({
        callerSessionId: input.creatorSessionId,
        targetSessionId: input.targetSessionId,
      });
      const repo = options.createPeerSessionRelationRepo?.() ?? new PeerSessionRelationRepo();
      try {
        const relation = await repo.findCreatedSession({
          workspacePath: target.workspacePath,
          ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
          targetSessionId: input.targetSessionId,
        });
        if (
          !relation ||
          relation.creatorSessionId !== input.creatorSessionId ||
          relation.workspaceKey !== input.workspaceKey ||
          relation.remoteSessionId ||
          input.remoteSessionId
        ) {
          throw new PermissionResolutionError(
            "not_authorized",
            "delegated permission is not authorized for this session",
          );
        }
        if (relation.approvalPolicy !== "delegated") {
          throw new PermissionResolutionError(
            "manual_policy",
            "target session does not allow delegated permission resolution",
          );
        }
      } finally {
        repo.close();
      }
      const resolved = await runPermissionResolutionWithClaim({
        workspacePath: target.workspacePath,
        ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        targetSessionId: input.targetSessionId,
        requestId: input.requestId,
        decision: input.decision,
        resolverKind: "ai",
        resolverSessionId: input.creatorSessionId,
        ...(input.reason ? { reason: input.reason } : {}),
        resolve: async () => {
          const snapshot = await session().readSession({
            workspacePath: target.workspacePath,
            ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
            sessionId: input.targetSessionId,
            messageLimit: 0,
          });
          const pending = snapshot?.projection.pendingPermissions.find(
            (item) => item.requestId === input.requestId,
          );
          if (!pending)
            throw new PermissionResolutionError(
              "request_not_found",
              "permission request is not pending",
            );
          const kind = input.decision === "allow_once" ? "allowOnce" : "deny";
          const option = pending.options.find((item) => item.kind === kind);
          if (!option)
            throw new PermissionResolutionError(
              "request_not_found",
              "permission request does not offer the requested decision",
            );
          try {
            const accepted = await task().respondPermission({
              taskId: input.targetSessionId,
              workspacePath: target.workspacePath,
              ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
              requestId: input.requestId,
              optionId: option.optionId,
              response: {
                decision: input.decision === "deny" ? "deny" : "allow",
                ...(input.reason ? { reason: input.reason } : {}),
              },
              resolution: {
                resolverKind: "ai",
                resolverSessionId: input.creatorSessionId,
                ...(input.reason ? { reason: input.reason } : {}),
              },
            });
            if (!accepted)
              throw new PermissionResolutionError(
                "request_not_found",
                "permission request is no longer pending",
              );
          } catch (error) {
            if (error instanceof PermissionResolutionError) throw error;
            throw new PermissionResolutionError(
              "runtime_unavailable",
              "target session runtime could not resolve permission",
              { cause: error },
            );
          }
        },
      });
      return {
        requestId: input.requestId,
        status: resolved ? "resolved" : "already_resolved",
        decision: input.decision,
      };
    },
  };
}
