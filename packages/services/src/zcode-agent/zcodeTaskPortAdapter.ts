// ============================================================
// ZCodeTaskPort Adapter — 将 IZCodeTaskService 适配为 ZCodeTaskPort
// ============================================================
//
// 用于 Host 侧：把 ServiceCollection 里的 IZCodeTaskService 实现转成协议层可用的端口。
// 与 createBotsCommandServiceExecutor 同构。

import type { IZCodeTaskService } from "../session/zcodeTaskService.js";
import type { ZCodeTaskPort } from "@zcode/contracts";
import type {
  ZCodeTaskMode,
  ZCodeTaskCreateResult,
  ZCodeTaskMeta,
  ZCodeTaskSnapshot,
  ZCodeTaskSnapshotBody,
  ZCodeTaskSnapshotToolCallsSlice,
  ZCodeTaskSnapshotRefContent,
  ZCodeTaskSnapshotWithEtagResult,
  ZCodeEnqueueTaskCommandResult,
  ZCodeCancelTaskCommandResult,
  ZCodeSessionCompactResult,
  ZCodeSessionGoalResult,
  ZCodeConfigOption,
  ModelSelection,
  ZCodeProvider,
  ZCodeAgentMcpServer,
  ZCodePromptAttachment,
  ZCodeAutomationBotDeliveryTarget,
  ZCodeBackgroundTurnAttribution,
  ZCodeTaskClientMode,
  ZCodeTaskTokenUsageResult,
  ZCodePermissionResponse,
  ZCodeImportSessionsResult,
  ZCodeImportableSessionCandidate,
  TraceId,
  ZCodeError,
} from "@zcode/shared";
import type {
  SessionMessageDeliveryResult,
  SessionMessageSendRequested,
} from "../session/sessionMailbox.js";

export function createZCodeTaskPortAdapter(deps: {
  readTaskService(): IZCodeTaskService | undefined;
}): ZCodeTaskPort {
  const getService = () => {
    const svc = deps.readTaskService();
    if (!svc) throw new Error("IZCodeTaskService unavailable");
    return svc;
  };

  return {
    // ---- 生命周期 ----
    initialize: (params) => getService().initialize(params),
    releaseWorkspacePreparation: (params) => getService().releaseWorkspacePreparation(params),

    // ---- Task/Session 管理 ----
    createTask: (params) => getService().createTask(params),
    sendPrompt: (params) => getService().sendPrompt(params),
    deliverSessionMessage: (request) => getService().deliverSessionMessage(request),
    sendSessionMessageDeliveryResult: (result) => getService().sendSessionMessageDeliveryResult(result),
    enqueueTaskCommand: (params) => getService().enqueueTaskCommand(params),
    promoteTaskCommand: (params) => getService().promoteTaskCommand(params),
    cancelTaskCommand: (params) => getService().cancelTaskCommand(params),
    stopGeneration: (params) => getService().stopGeneration(params),
    compactSession: (params) => getService().compactSession(params),
    goalSession: (params) => getService().goalSession(params),
    respondPermission: (params) => getService().respondPermission(params),
    respondElicitation: (params) => getService().respondElicitation(params),
    closeTask: (params) => getService().closeTask(params),
    resumeTask: (params) => getService().resumeTask(params),
    listTasks: (params) => getService().listTasks(params),
    listPinnedTaskIds: () => getService().listPinnedTaskIds(),
    listPinnedTasks: (params) => getService().listPinnedTasks(params),
    listDeletedTaskIds: (params) => getService().listDeletedTaskIds(params),
    listTaskList: (params) => getService().listTaskList(params),
    createTaskGroup: (params) => getService().createTaskGroup(params),
    renameTaskGroup: (params) => getService().renameTaskGroup(params),
    updateTaskGroupColor: (params) => getService().updateTaskGroupColor(params),
    deleteTaskGroup: (params) => getService().deleteTaskGroup(params),
    listGroupedTaskViewStructure: (params) => getService().listGroupedTaskViewStructure(params),
    applyGroupedTaskViewOrder: (params) => getService().applyGroupedTaskViewOrder(params),
    listArchivedTasks: (params) => getService().listArchivedTasks(params),
    archiveStaleTasks: (params) => getService().archiveStaleTasks(params),
    archiveWorkspaceTasks: (params) => getService().archiveWorkspaceTasks(params),
    getTaskSnapshot: (params) => getService().getTaskSnapshot(params),
    getTaskSnapshotWithEtag: (params) => getService().getTaskSnapshotWithEtag(params),
    getTaskSnapshotBody: (params) => getService().getTaskSnapshotBody(params),
    getTaskSnapshotRef: (params) => getService().getTaskSnapshotRef(params),
    getTaskSnapshotToolCallsSlice: (params) => getService().getTaskSnapshotToolCallsSlice(params),
    getTaskMeta: (params) => getService().getTaskMeta(params),
    getTaskConfigOptions: (params) => getService().getTaskConfigOptions(params),
    getTaskModelSelection: (params) => getService().getTaskModelSelection(params),
    setAssistantMessageFeedback: (params) => getService().setAssistantMessageFeedback(params),
    scanImportableClaudeSessions: (params) => getService().scanImportableClaudeSessions(params),
    importClaudeSessions: (params) => getService().importClaudeSessions(params),
    setMode: (params) => getService().setMode(params),
    setConfigOption: (params) => getService().setConfigOption(params),
    setModel: (params) => getService().setModel(params),
    setAutomationSessionConfig: (params) => getService().setAutomationSessionConfig(params),
    getTaskNativeSessionLogFile: (params) => getService().getTaskNativeSessionLogFile(params),
    getModelTrajectory: (params) => getService().getModelTrajectory(params),
    getTaskTokenUsage: (params) => getService().getTaskTokenUsage(params),
    getTaskSessionFilePath: (params) => getService().getTaskSessionFilePath(params),
    restartWorkspaceProcess: (params) => getService().restartWorkspaceProcess(params),
    deleteTask: (params) => getService().deleteTask(params),
    deleteArchivedTask: (params) => getService().deleteArchivedTask(params),
    deleteArchivedTasks: (params) => getService().deleteArchivedTasks(params),
    renameTask: (params) => getService().renameTask(params),
    setTaskPinned: (params) => getService().setTaskPinned(params),
  };
}