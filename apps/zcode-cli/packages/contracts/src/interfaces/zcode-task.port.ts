// ============================================================
// ZCodeTaskPort - AI Runtime 调用 ZCode Task API 的端口
// ============================================================
//
// 与 IZCodeTaskService 对应（packages/services/src/session/zcodeTaskService.ts）。
// Host 侧由 IZCodeTaskService 实现；本文件只做结构镜像，避免跨包依赖。

import type { TraceContext } from "../tracing/tracer.js";
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
} from "#src/session/sessionMailbox.js";

export interface ZCodeTaskPort {
  // ---- 生命周期 ----

  /** 检查 agent runtime 是否可用 */
  initialize(params: { workspacePath: string }): Promise<{ available: boolean; version?: string }>;

  /** 释放仅用于预热的空闲 workspace 会话 */
  releaseWorkspacePreparation(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: ZCodeProvider;
  }): Promise<void>;

  // ---- Task/Session 管理 ----

  /** 创建 ZCode session 并同步 task 索引 */
  createTask(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: ZCodeProvider;
    mode?: ZCodeTaskMode;
    modelSelection?: ModelSelection;
    model?: string;
    thoughtLevel?: string;
    draftSessionId?: string;
    forkedFromTaskId?: string;
    mcpServers?: ZCodeAgentMcpServer[];
    automationId?: string;
    offPeakTaskId?: string;
    deferPersistenceUntilFirstPrompt?: boolean;
    v4Create?: boolean;
  }): Promise<ZCodeTaskCreateResult>;

  /** 发送 prompt 到指定 task */
  sendPrompt(params: {
    taskId: string;
    remoteSessionId?: string;
    traceId: TraceId;
    queryId?: string;
    messageId?: string;
    content: string;
    attachments?: ZCodePromptAttachment[];
    clientId?: string;
    clientLabel?: string;
    clientMode?: ZCodeTaskClientMode;
    toolDenylist?: string[];
    botDeliveryTarget?: ZCodeAutomationBotDeliveryTarget;
    modelSelection?: ModelSelection;
    modelExecution?: {
      /** 仅 idle startNow 接受 */
      allowedTools?: string[];
      disallowedTools?: string[];
      [key: string]: unknown;
    };
  } & ZCodeBackgroundTurnAttribution): Promise<void>;

  /** 会话间消息投递（AI-to-AI） */
  deliverSessionMessage(
    request: SessionMessageSendRequested,
  ): Promise<SessionMessageDeliveryResult>;

  sendSessionMessageDeliveryResult(result: SessionMessageDeliveryResult): Promise<void>;

  /** 把 task runtime command 提交给 host */
  enqueueTaskCommand(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskId: string;
    commandId: string;
    traceId: TraceId;
    queryId?: string;
    type: "send_prompt";
    content: string;
    attachments?: ZCodePromptAttachment[];
    clientId?: string;
    clientLabel?: string;
    automationId?: string;
    ownerRunId?: TraceId;
  }): Promise<ZCodeEnqueueTaskCommandResult>;

  promoteTaskCommand(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskId: string;
    commandId: string;
    ownerRunId: TraceId;
    clientMode: ZCodeTaskClientMode;
  }): Promise<ZCodeEnqueueTaskCommandResult>;

  cancelTaskCommand(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskId: string;
    commandId: string;
    ownerRunId?: TraceId;
    clientMode: ZCodeTaskClientMode;
  }): Promise<ZCodeCancelTaskCommandResult>;

  /** 停止当前正在进行的生成 */
  stopGeneration(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    runId?: TraceId;
  }): Promise<void>;

  /** 执行 agent 内建 /compact 命令 */
  compactSession(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    inputId?: string;
    instructions?: string;
    expectedRevision?: number;
  }): Promise<ZCodeSessionCompactResult>;

  /** 执行 agent 内建 /goal 命令 */
  goalSession(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    inputId?: string;
    action: "set" | "update" | "complete" | "pause" | "resume" | "cancel";
    objective?: string;
    expectedRevision?: number;
  }): Promise<ZCodeSessionGoalResult>;

  /** 响应权限请求 */
  respondPermission(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    runId?: TraceId;
    requestId: string;
    optionId: string;
    response: ZCodePermissionResponse;
  }): Promise<boolean>;

  /** 响应用户问答请求（Elicitation） */
  respondElicitation(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    runId?: TraceId;
    requestId: string;
    action: "accept" | "decline" | "cancel";
    content?: Record<string, unknown>;
    clientMode?: ZCodeTaskClientMode;
  }): Promise<boolean>;

  /** 关闭 task */
  closeTask(params: { taskId: string }): Promise<void>;

  /** 恢复已有 task */
  resumeTask(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    mode?: ZCodeTaskMode;
    model?: string;
    thoughtLevel?: string;
    automationId?: string;
    offPeakTaskId?: string;
    mcpServers?: ZCodeAgentMcpServer[];
  }): Promise<ZCodeTaskMeta>;

  /** 列出 workspace 下所有已持久化的 task */
  listTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskMeta[]>;

  /** 读取全局 pinned task id 列表 */
  listPinnedTaskIds(): Promise<string[]>;

  /** 按 tasks-index.sqlite 中的 pinned 状态列出当前 workspace 下所有 pinned task */
  listPinnedTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskMeta[]>;

  /** 读取 workspace 下已删除 task id */
  listDeletedTaskIds(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<string[]>;

  /** 聚合查询任务列表 */
  listTaskList(params: {
    workspaceScopes: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
    includeArchived?: boolean;
    limit?: number;
    sortBy?: string;
    order?: "asc" | "desc";
  }): Promise<{
    tasks: ZCodeTaskMeta[];
    total: number;
  }>;

  /** 创建最小 task group */
  createTaskGroup(params?: {
    title?: string;
    color?: string;
  }): Promise<{ groupId: string; title: string; color: string }>;

  /** 重命名 task group */
  renameTaskGroup(params: {
    groupId: string;
    title: string;
    workspaceScopes?: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
  }): Promise<{ groupId: string; title: string; color: string }>;

  /** 更新 task group 颜色 */
  updateTaskGroupColor(params: {
    groupId: string;
    color: string;
    workspaceScopes?: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
  }): Promise<{ groupId: string; title: string; color: string }>;

  /** 删除 task group */
  deleteTaskGroup(params: {
    groupId: string;
    workspaceScopes?: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
  }): Promise<void>;

  /** 查询 Grouped 视图原始结构 */
  listGroupedTaskViewStructure(params: {
    workspaceScopes: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
  }): Promise<{
    groups: Array<{
      groupId: string;
      title: string;
      color: string;
      memberTaskIds: string[];
    }>;
    topLevelTaskIds: string[];
    topLevelOrder: string[];
  }>;

  /** 提交 grouped 视图最终排序和 membership */
  applyGroupedTaskViewOrder(params: {
    groups: Array<{
      groupId: string;
      title: string;
      color: string;
      memberTaskIds: string[];
    }>;
    topLevelOrder: string[];
    workspaceScopes: Array<{
      workspacePath: string;
      workspaceIdentity?: string;
    }>;
  }): Promise<void>;

  /** 列出 workspace 下所有已归档 task */
  listArchivedTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskMeta[]>;

  /** 批量归档超期旧任务 */
  archiveStaleTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    olderThanDays: number;
  }): Promise<ZCodeTaskMeta[]>;

  /** 移除 workspace 时批量归档 */
  archiveWorkspaceTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskMeta[]>;

  /** 读取单个 task 的本地持久化快照 */
  getTaskSnapshot(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    messageLimit?: number;
    byteBudget?: number;
    toolLimit?: number;
    clientMode?: ZCodeTaskClientMode;
    resumeModelPolicy?: "task-index" | "ui-resolved-only";
    model?: string;
    thoughtLevel?: string;
  }): Promise<ZCodeTaskSnapshot | null>;

  /** 读取 task 快照并携带 ETag */
  getTaskSnapshotWithEtag(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    messageLimit?: number;
    ifNoneMatch?: string;
    byteBudget?: number;
    toolLimit?: number;
    clientMode?: ZCodeTaskClientMode;
    resumeModelPolicy?: "task-index" | "ui-resolved-only";
    model?: string;
    thoughtLevel?: string;
  }): Promise<ZCodeTaskSnapshotWithEtagResult>;

  /** 按 bodyRef 读取被首屏预算裁剪的大消息完整正文 */
  getTaskSnapshotBody(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    refId: string;
  }): Promise<ZCodeTaskSnapshotBody | null>;

  /** 按 ref 读取被首屏预算裁剪的工具或文件变更完整字段 */
  getTaskSnapshotRef(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    refId: string;
  }): Promise<ZCodeTaskSnapshotRefContent | null>;

  /** 按 message + 下标范围补拉 tools 切片 */
  getTaskSnapshotToolCallsSlice(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    messageIndex: number;
    startToolIndex: number;
    limit: number;
  }): Promise<ZCodeTaskSnapshotToolCallsSlice | null>;

  /** 读取单个 task 的轻量 meta */
  getTaskMeta(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskMeta | null>;

  /** 读取当前 active task 内存态的配置选项 */
  getTaskConfigOptions(params: { taskId: string }): Promise<ZCodeConfigOption[]>;

  /** 读取绑定 Session 的原模型选择 */
  getTaskModelSelection(params: { taskId: string }): Promise<ModelSelection | null>;

  /** 持久化用户对 assistant 回复的本地反馈 */
  setAssistantMessageFeedback(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    turnIndex: number;
    feedback: "like" | "dislike" | null;
  }): Promise<{ path: string; size: number }>;

  /** 扫描可导入的 Claude 原生 session */
  scanImportableClaudeSessions(params: {
    workspacePath?: string;
    workspaceIdentity?: string;
    modifiedSince?: number;
    limit?: number;
  }): Promise<ZCodeImportableSessionCandidate[]>;

  /** 导入选中的 Claude 原生 session */
  importClaudeSessions(params: {
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionIds: string[];
  }): Promise<ZCodeImportSessionsResult>;

  /** 切换 task 模式 */
  setMode(params: { taskId: string; mode: ZCodeTaskMode }): Promise<void>;

  /** 切换 configOption，返回更新后的完整 configOptions 列表 */
  setConfigOption(params: {
    taskId: string;
    traceId: TraceId;
    configId: string;
    value: string;
  }): Promise<ZCodeConfigOption[]>;

  /** 切换模型，返回服务端 authoritative configOptions */
  setModel(params: {
    taskId: string;
    traceId: TraceId;
    modelSelection: ModelSelection;
  }): Promise<ZCodeConfigOption[]>;

  /** 定时任务派发专用：收敛模型、Think 和权限模式 */
  setAutomationSessionConfig(params: {
    taskId: string;
    traceId: TraceId;
    modelSelection: ModelSelection;
    thoughtLevel?: string;
    mode?: ZCodeTaskMode;
  }): Promise<ZCodeConfigOption[]>;

  /** 获取 ZCode Agent 当前结构化日志文件路径 */
  getTaskNativeSessionLogFile(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<{
    provider: ZCodeProvider | null;
    path: string | null;
    exists: boolean;
  }>;

  /** 读取 task 对应的模型调用轨迹 */
  getModelTrajectory(params: {
    taskId: string;
    limit?: number;
  }): Promise<{
    taskId: string;
    available: boolean;
    records: Array<{
      requestId: string;
      attempt: number;
      startedAt: string;
      completedAt?: string;
      durationMs?: number;
      turnId?: string;
      traceId?: string;
      callSource?: { kind: string; querySource?: string };
      model: { modelId?: string; providerId?: string; role?: string; source?: string };
      request: { messages: Array<{ role: string; parts: unknown[] }>; toolNames: string[] };
      response?: { finishReason?: string; text?: string; reasoningText?: string; toolCalls: unknown[]; usage?: unknown; responseId?: string; modelId?: string };
      error?: { name: string; message: string; stack?: string };
    }>;
    sourceFiles: string[];
    truncated: boolean;
  }>;

  /** 从 agent usage 数据库读取某个 task/session 的累计模型 token 用量 */
  getTaskTokenUsage(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<ZCodeTaskTokenUsageResult>;

  /** 获取 task 持久化快照文件路径 */
  getTaskSessionFilePath(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<{
    path: string;
    exists: boolean;
  }>;

  /** 重启指定 workspace 的 ZCode Agent 共享进程 */
  restartWorkspaceProcess(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: ZCodeProvider;
    resumeTaskId?: string;
    bumpRuntimeEpoch?: boolean;
  }): Promise<void>;

  /** 将已持久化 task 标记为列表不可见 */
  deleteTask(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<void>;

  /** 仅删除写入时仍归档的任务 */
  deleteArchivedTask(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<boolean>;

  /** 逐项执行归档条件删除 */
  deleteArchivedTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskIds: string[];
  }): Promise<{
    deletedTaskIds: string[];
    skippedTaskIds: string[];
    failedTaskIds: string[];
  }>;

  /** 重命名已持久化的 task */
  renameTask(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    title: string;
  }): Promise<ZCodeTaskMeta>;

  /** 更新 task 置顶状态 */
  setTaskPinned(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    pinned: boolean;
  }): Promise<void>;
}