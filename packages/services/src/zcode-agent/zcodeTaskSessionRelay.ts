import {
  zcodeProtocolEmptyResultSchema,
  zcodeProtocolMethods,
  zcodeSessionListSessionsParamsSchema,
  zcodeSessionReadSessionParamsSchema,
  zcodeTaskCompactSessionParamsSchema,
  zcodeTaskCreateTaskParamsSchema,
  zcodeTaskGetTaskSnapshotParamsSchema,
  zcodeTaskListTasksParamsSchema,
  zcodeWorkspaceListParamsSchema,
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
import type { WorkspaceIndexServiceExecutor } from "./workspaceIndexServiceExecutor.js";

type RelayClient = Pick<ZCodeProtocolClient, "respond" | "respondError">;

/** AI task/session reverse requests; missing executors fail through JSON-RPC. */
export function handleTaskSessionReverseRequest(args: {
  request: ZCodeProtocolRequest;
  client: RelayClient;
  taskExecutor: ZCodeTaskServiceExecutor | undefined;
  workspaceIndexExecutor?: WorkspaceIndexServiceExecutor;
}): boolean {
  const { request, client, taskExecutor } = args;
  const respondFailure = (error: unknown): void => {
    // 失败必须走 JSON-RPC error；发送 success=false 会被 agent 侧按结果 schema
    // 解析，最终掩盖原始服务错误（例如 FOREIGN KEY constraint failed）。
    const numericCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    void client.respondError(request.id, {
      code: typeof numericCode === "number" ? numericCode : -32603,
      message: error instanceof Error ? error.message : String(error),
    });
  };

  if (request.method === zcodeProtocolMethods.workspaceList) {
    const parsed = zcodeWorkspaceListParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      void client.respondError(request.id, { code: -32602, message: "Invalid workspace/list params", data: parsed.error.flatten() });
      return true;
    }
    if (!args.workspaceIndexExecutor) {
      respondFailure("Host workspace index service not available");
      return true;
    }
    void args.workspaceIndexExecutor.listWorkspaces().then((result) => client.respond(request.id, result)).catch(respondFailure);
    return true;
  }

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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
        callerSessionId: parsed.data.sessionId, workspaceKey: parsed.data.workspaceKey,
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
