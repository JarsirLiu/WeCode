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

    getTaskSnapshot: (input) =>
      task().getTaskSnapshot({
        taskId: input.taskId,
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        ...(input.messageLimit ? { messageLimit: input.messageLimit } : {}),
        ...(input.byteBudget ? { byteBudget: input.byteBudget } : {}),
        ...(input.toolLimit ? { toolLimit: input.toolLimit } : {}),
        ...(input.clientMode ? { clientMode: input.clientMode as ZCodeTaskClientMode } : {}),
        ...(input.resumeModelPolicy ? { resumeModelPolicy: input.resumeModelPolicy } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.thoughtLevel ? { thoughtLevel: input.thoughtLevel } : {}),
      }),

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
