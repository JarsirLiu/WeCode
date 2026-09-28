import type { ZCodeTaskPort, TraceContext } from "@zcode/contracts";
import { zcodeTaskTypes } from "@zcode/shared";
import {
  buildWorkspaceRequestContext,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";
import { zcodeProtocolMethods } from "@zcode/shared";

/**
 * ProtocolZCodeTaskBroker —— agent 侧 ZCodeTaskPort 实现。
 *
 * ZCode Task 工具的每次调用经此把命令事实变成 ZCode Protocol 的 task/* 反向请求，
 * 由 host 的 IZCodeTaskService 执行并返回结构化结果。
 * workspace 元数据只从受信 session record 读取，模型输入中的替代值没有入口。
 */
export function createProtocolZCodeTaskBroker(
  context: ZCodeProtocolAgentServerContext,
): ZCodeTaskPort {
  const request = async <T>(
    method: string,
    params: unknown,
    resultSchema: any,
    traceContext?: TraceContext,
    signal?: AbortSignal,
  ): Promise<T> => {
    return context.requestClient(
      method as any,
      params,
      resultSchema,
      {
        ...(signal ? { signal } : {}),
        ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
      } as ZCodeProtocolClientRequestOptions,
    );
  };

  return {
    // ---- 生命周期 ----
    initialize: (params) => request(
      "task/initialize",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.initializeResultSchema,
    ),
    releaseWorkspacePreparation: (params) => request(
      "task/releaseWorkspacePreparation",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.releaseWorkspacePreparationResultSchema,
    ),

    // ---- Task/Session 管理 ----
    createTask: (params) => request(
      "task/createTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.createTaskResultSchema,
    ),
    sendPrompt: (params) => request(
      "task/sendPrompt",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.sendPromptResultSchema,
    ),
    deliverSessionMessage: (request) => request(
      "task/deliverSessionMessage",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: undefined }),
      zcodeTaskTypes.deliverSessionMessageResultSchema,
    ),
    sendSessionMessageDeliveryResult: (result) => request(
      "task/sendSessionMessageDeliveryResult",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: undefined }),
      zcodeTaskTypes.sendSessionMessageDeliveryResultSchema,
    ),
    enqueueTaskCommand: (params) => request(
      "task/enqueueTaskCommand",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.enqueueTaskCommandResultSchema,
    ),
    promoteTaskCommand: (params) => request(
      "task/promoteTaskCommand",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.promoteTaskCommandResultSchema,
    ),
    cancelTaskCommand: (params) => request(
      "task/cancelTaskCommand",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.cancelTaskCommandResultSchema,
    ),
    stopGeneration: (params) => request(
      "task/stopGeneration",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.stopGenerationResultSchema,
    ),
    compactSession: (params) => request(
      "task/compactSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.compactSessionResultSchema,
    ),
    goalSession: (params) => request(
      "task/goalSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.goalSessionResultSchema,
    ),
    respondPermission: (params) => request(
      "task/respondPermission",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.respondPermissionResultSchema,
    ),
    respondElicitation: (params) => request(
      "task/respondElicitation",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.respondElicitationResultSchema,
    ),
    closeTask: (params) => request(
      "task/closeTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.closeTaskResultSchema,
    ),
    resumeTask: (params) => request(
      "task/resumeTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.resumeTaskResultSchema,
    ),
    listTasks: (params) => request(
      "task/listTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listTasksResultSchema,
    ),
    listPinnedTaskIds: () => request(
      "task/listPinnedTaskIds",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: undefined }),
      zcodeTaskTypes.listPinnedTaskIdsResultSchema,
    ),
    listPinnedTasks: (params) => request(
      "task/listPinnedTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listPinnedTasksResultSchema,
    ),
    listDeletedTaskIds: (params) => request(
      "task/listDeletedTaskIds",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listDeletedTaskIdsResultSchema,
    ),
    listTaskList: (params) => request(
      "task/listTaskList",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listTaskListResultSchema,
    ),
    createTaskGroup: (params) => request(
      "task/createTaskGroup",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.createTaskGroupResultSchema,
    ),
    renameTaskGroup: (params) => request(
      "task/renameTaskGroup",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.renameTaskGroupResultSchema,
    ),
    updateTaskGroupColor: (params) => request(
      "task/updateTaskGroupColor",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.updateTaskGroupColorResultSchema,
    ),
    deleteTaskGroup: (params) => request(
      "task/deleteTaskGroup",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.deleteTaskGroupResultSchema,
    ),
    listGroupedTaskViewStructure: (params) => request(
      "task/listGroupedTaskViewStructure",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listGroupedTaskViewStructureResultSchema,
    ),
    applyGroupedTaskViewOrder: (params) => request(
      "task/applyGroupedTaskViewOrder",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.applyGroupedTaskViewOrderResultSchema,
    ),
    listArchivedTasks: (params) => request(
      "task/listArchivedTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.listArchivedTasksResultSchema,
    ),
    archiveStaleTasks: (params) => request(
      "task/archiveStaleTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.archiveStaleTasksResultSchema,
    ),
    archiveWorkspaceTasks: (params) => request(
      "task/archiveWorkspaceTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.archiveWorkspaceTasksResultSchema,
    ),
    getTaskSnapshot: (params) => request(
      "task/getTaskSnapshot",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSnapshotResultSchema,
    ),
    getTaskSnapshotWithEtag: (params) => request(
      "task/getTaskSnapshotWithEtag",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSnapshotWithEtagResultSchema,
    ),
    getTaskSnapshotBody: (params) => request(
      "task/getTaskSnapshotBody",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSnapshotBodyResultSchema,
    ),
    getTaskSnapshotRef: (params) => request(
      "task/getTaskSnapshotRef",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSnapshotRefResultSchema,
    ),
    getTaskSnapshotToolCallsSlice: (params) => request(
      "task/getTaskSnapshotToolCallsSlice",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSnapshotToolCallsSliceResultSchema,
    ),
    getTaskMeta: (params) => request(
      "task/getTaskMeta",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskMetaResultSchema,
    ),
    getTaskConfigOptions: (params) => request(
      "task/getTaskConfigOptions",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskConfigOptionsResultSchema,
    ),
    getTaskModelSelection: (params) => request(
      "task/getTaskModelSelection",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskModelSelectionResultSchema,
    ),
    setAssistantMessageFeedback: (params) => request(
      "task/setAssistantMessageFeedback",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setAssistantMessageFeedbackResultSchema,
    ),
    scanImportableClaudeSessions: (params) => request(
      "task/scanImportableClaudeSessions",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.scanImportableClaudeSessionsResultSchema,
    ),
    importClaudeSessions: (params) => request(
      "task/importClaudeSessions",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.importClaudeSessionsResultSchema,
    ),
    setMode: (params) => request(
      "task/setMode",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setModeResultSchema,
    ),
    setConfigOption: (params) => request(
      "task/setConfigOption",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setConfigOptionResultSchema,
    ),
    setModel: (params) => request(
      "task/setModel",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setModelResultSchema,
    ),
    setAutomationSessionConfig: (params) => request(
      "task/setAutomationSessionConfig",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setAutomationSessionConfigResultSchema,
    ),
    getTaskNativeSessionLogFile: (params) => request(
      "task/getTaskNativeSessionLogFile",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskNativeSessionLogFileResultSchema,
    ),
    getModelTrajectory: (params) => request(
      "task/getModelTrajectory",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getModelTrajectoryResultSchema,
    ),
    getTaskTokenUsage: (params) => request(
      "task/getTaskTokenUsage",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskTokenUsageResultSchema,
    ),
    getTaskSessionFilePath: (params) => request(
      "task/getTaskSessionFilePath",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.getTaskSessionFilePathResultSchema,
    ),
    restartWorkspaceProcess: (params) => request(
      "task/restartWorkspaceProcess",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.restartWorkspaceProcessResultSchema,
    ),
    deleteTask: (params) => request(
      "task/deleteTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.deleteTaskResultSchema,
    ),
    deleteArchivedTask: (params) => request(
      "task/deleteArchivedTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.deleteArchivedTaskResultSchema,
    ),
    deleteArchivedTasks: (params) => request(
      "task/deleteArchivedTasks",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.deleteArchivedTasksResultSchema,
    ),
    renameTask: (params) => request(
      "task/renameTask",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.renameTaskResultSchema,
    ),
    setTaskPinned: (params) => request(
      "task/setTaskPinned",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeTaskTypes.setTaskPinnedResultSchema,
    ),
  };
}

function protocolTraceFromTraceContext(traceContext: TraceContext): any {
  return {
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    parentSpanId: traceContext.parentSpanId,
    ...(traceContext.attributes ? { attributes: traceContext.attributes } : {}),
  };
}