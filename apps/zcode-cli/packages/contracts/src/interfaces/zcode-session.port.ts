// ============================================================
// ZCodeSessionPort - AI Runtime 调用 ZCode Session API 的端口
// ============================================================
//
// 与 IZCodeSessionService 对应（packages/services/src/zcode-session/zcodeSession.ts）。
// Host 侧由 IZCodeSessionService 实现；本文件只做结构镜像，避免跨包依赖。

import type { TraceContext } from "../tracing/tracer.js";
import type {
  ZCodeSessionMode,
  ZCodeSessionStateSnapshot,
  ZCodeWorkspacePresentation,
  ModelSelection,
  ZCodeMessageWithParts,
  ZCodeSessionEvent,
  ZCodeStateUpdatedNotification,
  ZCodePermissionRequestParams,
  ZCodeUserInputRequestParams,
  ZCodeUserInputResponse,
  ZCodeSessionInfo,
  ZCodeSessionPersistence,
  ZCodeSessionImportHistory,
  ZCodeAgentMcpServer,
  TraceId,
  ZCodeDeliveryKind,
} from "@zcode/shared";

export interface ZCodeSessionPort {
  // ---- Workspace ----

  initializeWorkspace(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<{
    available: boolean;
    workspaceKey: string;
    protocolName?: string;
    protocolVersion?: number;
    transportKind?: "stdio" | "websocket";
    reason?: string;
    reasonCode?: "provider_not_ready";
  }>;

  getWorkspaceRuntimeIdentity(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<{
    generation: number;
    identity: string;
    processId?: number;
    workspaceKey: string;
  }>;

  readWorkspacePresentation(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<ZCodeWorkspacePresentation>;

  // ---- Session 生命周期 ----

  /** 创建新会话 */
  createSession(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    sessionId?: string;
    sessionTraceId?: TraceId;
    parentSessionId?: string;
    mode?: ZCodeSessionMode;
    model?: ModelSelection;
    persistence?: ZCodeSessionPersistence;
    thoughtLevel?: string;
    mcpServers?: ZCodeAgentMcpServer[];
    importedHistory?: ZCodeSessionImportHistory;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 恢复现有会话 */
  resumeSession(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    model?: ModelSelection;
    thoughtLevel?: string;
    mcpServers?: ZCodeAgentMcpServer[];
    broadcastSnapshot?: boolean;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 列出会话 */
  listSessions(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<ZCodeSessionInfo[]>;

  /** 读取会话状态 */
  readSession(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    deliveryKind?: ZCodeDeliveryKind;
    messageLimit?: number;
    afterSeq?: number;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 读取会话消息 */
  readSessionMessages(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    afterMessageId?: string;
    limit?: number;
  }): Promise<ZCodeMessageWithParts[]>;

  /** 读取会话事件 */
  readSessionEvents(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    afterSeq?: number;
    limit?: number;
  }): Promise<ZCodeSessionEvent[]>;

  /** 推广 deferred draft session */
  promoteDeferredDraftSession(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<void>;

  /** 关闭会话 */
  closeSession(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<void>;

  /** 关闭 deferred draft session */
  closeDeferredDraftSession(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<boolean>;

  // ---- 配置 ----

  /** 设置模型 */
  setModel(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    model: ModelSelection;
    expectedRevision?: number;
    persistAsWorkspaceLastUsed?: boolean;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 设置思考级别 */
  setThoughtLevel(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    thoughtLevel?: string;
    expectedRevision?: number;
    persistAsWorkspaceLastUsed?: boolean;
  }): Promise<ZCodeSessionStateSnapshot>;

  /** 设置协作模式 */
  setMode(params: {
    sessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    mode: ZCodeSessionMode;
    expectedRevision?: number;
  }): Promise<ZCodeSessionStateSnapshot>;
}