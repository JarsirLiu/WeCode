import {
  zcodeProtocolEmptyResultSchema,
  zcodeProtocolMethods,
  zcodeSessionListSessionsParamsSchema,
  zcodeSessionReadSessionParamsSchema,
  zcodeTaskCompactSessionParamsSchema,
  zcodeTaskCreateTaskParamsSchema,
  zcodeTaskGetTaskSnapshotParamsSchema,
  zcodeTaskListTasksParamsSchema,
  zcodeTaskResumeTaskParamsSchema,
  zcodeTaskSendPromptParamsSchema,
  zcodeTaskSetModelParamsSchema,
  zcodeTaskStopGenerationParamsSchema,
  zcodePermissionResolveSessionPermissionParamsSchema,
  type ZCodeProtocolRequest,
} from "@zcode/shared";
import type { ZCodeProtocolClient } from "./zcodeProtocolClient.js";
import type { ZCodeTaskServiceExecutor } from "./zcodeTaskCommandExecutor.js";
import { PermissionResolutionError } from "./permissionResolutionError.js";

type RelayClient = Pick<ZCodeProtocolClient, "respond" | "respondError">;

/**
 * AI Session Orchestration：agent 的 task/* / session/* 反向请求转发给
 * IZCodeTaskService / IZCodeSessionService 执行桥（spec: docs/specs/ai-session-orchestration.md）。
 * executor 注入方式同 botsCommandExecutor；缺省返回结构化失败，不伪造成功。
 */
export function handleTaskSessionReverseRequest(args: {
  request: ZCodeProtocolRequest;
  client: RelayClient;
  taskExecutor: ZCodeTaskServiceExecutor | undefined;
}): boolean {
  const { request, client, taskExecutor } = args;
  const respondFailure = (error: unknown): void => {
    void client.respond(request.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  };

  if (request.method === zcodeProtocolMethods.taskCreateTask) {
    const parsed = zcodeTaskCreateTaskParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/createTask params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .createTask({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        mode: parsed.data.mode,
        modelSelection: parsed.data.modelSelection,
        model: parsed.data.model,
        thoughtLevel: parsed.data.thoughtLevel,
        draftSessionId: parsed.data.draftSessionId,
        forkedFromTaskId: parsed.data.forkedFromTaskId,
        automationId: parsed.data.automationId,
        offPeakTaskId: parsed.data.offPeakTaskId,
        deferPersistenceUntilFirstPrompt: parsed.data.deferPersistenceUntilFirstPrompt,
        v4Create: parsed.data.v4Create,
        creatorSessionId: parsed.data.sessionId,
        approvalPolicy: parsed.data.approvalPolicy,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.permissionResolveSessionPermission) {
    const parsed = zcodePermissionResolveSessionPermissionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid permission/resolveSessionPermission params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .resolveSessionPermission({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        creatorSessionId: parsed.data.sessionId,
        targetSessionId: parsed.data.targetSessionId,
        requestId: parsed.data.permissionRequestId,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
      })
      .then((result) => client.respond(request.id, result))
      .catch((error) => {
        if (error instanceof PermissionResolutionError) {
          void client.respondError(request.id, {
            code: -32603,
            message: error.message,
            data: { code: error.code },
          });
          return;
        }
        respondFailure(error);
      });
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskSendPrompt) {
    const parsed = zcodeTaskSendPromptParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/sendPrompt params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .sendPrompt({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        traceId: parsed.data.traceId,
        queryId: parsed.data.queryId,
        messageId: parsed.data.messageId,
        content: parsed.data.content,
        attachments: parsed.data.attachments,
        clientId: parsed.data.clientId,
        clientLabel: parsed.data.clientLabel,
        toolDenylist: parsed.data.toolDenylist,
        modelSelection: parsed.data.modelSelection,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskStopGeneration) {
    const parsed = zcodeTaskStopGenerationParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/stopGeneration params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .stopGeneration({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        runId: parsed.data.runId,
      })
      .then(() => client.respond(request.id, zcodeProtocolEmptyResultSchema.parse({})))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskCompactSession) {
    const parsed = zcodeTaskCompactSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/compactSession params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .compactSession({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        inputId: parsed.data.inputId,
        instructions: parsed.data.instructions,
        expectedRevision: parsed.data.expectedRevision,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskResumeTask) {
    const parsed = zcodeTaskResumeTaskParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/resumeTask params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .resumeTask({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        mode: parsed.data.mode,
        model: parsed.data.model,
        thoughtLevel: parsed.data.thoughtLevel,
        automationId: parsed.data.automationId,
        offPeakTaskId: parsed.data.offPeakTaskId,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskListTasks) {
    const parsed = zcodeTaskListTasksParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/listTasks params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .listTasks({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskGetTaskSnapshot) {
    const parsed = zcodeTaskGetTaskSnapshotParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/getTaskSnapshot params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .getTaskSnapshot({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        messageLimit: parsed.data.messageLimit,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.taskSetModel) {
    const parsed = zcodeTaskSetModelParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid task/setModel params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .setModel({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        taskId: parsed.data.taskId,
        traceId: parsed.data.traceId,
        modelSelection: parsed.data.modelSelection,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.sessionReadSession) {
    const parsed = zcodeSessionReadSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid session/readSession params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .readSession({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        targetSessionId: parsed.data.targetSessionId,
        messageLimit: parsed.data.messageLimit,
        afterSeq: parsed.data.afterSeq,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  if (request.method === zcodeProtocolMethods.sessionListSessions) {
    const parsed = zcodeSessionListSessionsParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, {
        code: -32602,
        message: "Invalid session/listSessions params",
        data: parsed.error.flatten(),
      });
      return true;
    }
    if (!taskExecutor) {
      respondFailure("zcode task service not available");
      return true;
    }
    void taskExecutor
      .listSessions({
        workspaceKey: parsed.data.workspaceKey,
        workspacePath: parsed.data.workspacePath,
        workspaceIdentity: parsed.data.workspaceIdentity,
        remoteSessionId: parsed.data.remoteSessionId,
        clientMode: parsed.data.clientMode,
        includeArchived: parsed.data.includeArchived,
        limit: parsed.data.limit,
      })
      .then((result) => client.respond(request.id, result))
      .catch(respondFailure);
    return true;
  }

  return false;
}
