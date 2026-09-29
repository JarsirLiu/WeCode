import type {
  ZCodeTaskMode,
  ModelSelection,
  TraceId,
  ZCodeSessionStateSnapshot,
  ZCodeSessionInfo,
  ZCodeTaskCreateResult,
  ZCodeTaskMeta,
  ZCodeConfigOption,
  ZCodeSessionCompactResult,
  ZCodeAiTaskSnapshot,
  ZCodeAiTaskPromptAdmission,
  PeerSessionApprovalPolicy,
} from "@zcode/shared";

/**
 * ZCodeTaskServiceExecutor —— host 侧 AI 会话编排执行桥。
 *
 * agent 的 task/* 反向请求经 zcodeAgentService 到达这里；实现方
 * （createLocalServices 装配）负责把受信 session 的 workspace 元素数据传给
 * IZodeTaskService / IZodeSessionService 执行。缺省（纯 CLI / 未装配）由
 * zcodeAgentService 返回结构化失败，不伪造成功。
 *
 * 与 BotsCommandServiceExecutor 同模式：executor 只负责业务执行，身份/路由字段
 * 已经在 zcodeAgentService 里按 zcodeAiOrchestrationRequestContextSchema 解析并注入。
 *
 * 返回值类型直接用 @zcode/shared 的 service 结果类型（ZCodeTaskCreateResult、
 * ZCodeTaskSnapshot 等），避免手写一份与 service 漂移的 bespoke 结构。
 */
export interface ZCodeTaskServiceExecutor {
  createTask(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    mode?: ZCodeTaskMode;
    modelSelection?: ModelSelection;
    model?: string;
    thoughtLevel?: string;
    draftSessionId?: string;
    forkedFromTaskId?: string;
    automationId?: string;
    offPeakTaskId?: string;
    deferPersistenceUntilFirstPrompt?: boolean;
    v4Create?: boolean;
    creatorSessionId: string;
    approvalPolicy?: PeerSessionApprovalPolicy;
  }): Promise<ZCodeTaskCreateResult>;

  sendPrompt(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    traceId: TraceId;
    queryId?: string;
    messageId?: string;
    content: string;
    attachments?: Record<string, unknown>[];
    clientId?: string;
    clientLabel?: string;
    toolDenylist?: string[];
    modelSelection?: ModelSelection;
  }): Promise<ZCodeAiTaskPromptAdmission>;

  stopGeneration(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    runId?: TraceId;
  }): Promise<void>;

  compactSession(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    inputId?: string;
    instructions?: string;
    expectedRevision?: number;
  }): Promise<ZCodeSessionCompactResult>;

  resumeTask(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    mode?: ZCodeTaskMode;
    model?: string;
    thoughtLevel?: string;
    automationId?: string;
    offPeakTaskId?: string;
  }): Promise<ZCodeTaskMeta>;

  listTasks(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
  }): Promise<ZCodeTaskMeta[]>;

  getTaskSnapshot(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    messageLimit?: number;
  }): Promise<ZCodeAiTaskSnapshot | null>;

  setModel(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    taskId: string;
    traceId: TraceId;
    modelSelection: ModelSelection;
  }): Promise<ZCodeConfigOption[]>;

  // === Session 只读方法（走 IZodeSessionService，非 task service）===

  /** 读取目标会话完整快照。targetSessionId 是要读的会话，不是调用方。 */
  readSession(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    targetSessionId: string;
    messageLimit?: number;
    afterSeq?: number;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 列出 workspace 下的会话。走 IZodeSessionService.listSessions，返回 session info（非 task meta）。 */
  listSessions(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<ZCodeSessionInfo[]>;

  resolveSessionPermission(input: {
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    creatorSessionId: string;
    targetSessionId: string;
    requestId: string;
    decision: "allow_once" | "allow_always" | "deny";
    reason?: string;
  }): Promise<{
    requestId: string;
    status: "resolved" | "already_resolved";
    decision: "allow_once" | "allow_always" | "deny";
  }>;
}
