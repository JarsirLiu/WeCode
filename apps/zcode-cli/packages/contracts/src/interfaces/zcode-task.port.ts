// ============================================================
// ZCodeTaskPort - AI Runtime 调用 ZCode Task API 的端口
// ============================================================
//
// 与 IZCodeTaskService 对应（packages/services/src/session/zcodeTaskService.ts）。
// Host 侧由 IZCodeTaskService 实现；本文件只做结构镜像，避免跨包依赖。
//
// 范围约束（spec: docs/specs/ai-session-orchestration.md）：只暴露 AI 会话编排需要的
// 方法。任务分组、归档、置顶、Claude 导入、快照分片（etag/ref/body/slice）、trajectory、
// token 用量等 UI 管理操作不进 AI 工具面——UI 直接走 IZCodeTaskService RPC，不需要这条
// 协议链路。要扩时按 spec 追加，不要整面镜像服务接口。

import type { TraceContext } from "../tracing/tracer.js";
import type {
  ZCodeTaskMode,
  ZCodeTaskMeta,
  ZCodeSessionCompactResult,
  ZCodeConfigOption,
  ModelSelection,
  ZCodeProvider,
  ZCodeAgentMcpServer,
  ZCodePromptAttachment,
  ZCodeAutomationBotDeliveryTarget,
  ZCodeBackgroundTurnAttribution,
  ZCodeTaskClientMode,
  TraceId,
  // AI 侧紧凑类型（spec: docs/specs/ai-session-orchestration.md）
  ZCodeAiTaskCreateResult,
  ZCodeAiTaskPromptAdmission,
  ZCodeAiTaskSnapshot,
  ZCodeAiConfigOption,
  PeerSessionApprovalPolicy,
} from "@zcode/shared";

/**
 * 所有方法统一的尾部字段：
 * - sessionId：调用方（工具 handler）从 ToolExecutionContext 传入，broker 用它解析
 *   受信 session record。与 BotsCommandExecutionInput 同约定，不从 broker 闭包取。
 * - traceContext：agent 侧全链路追踪上下文，经协议反向请求传播给 host。
 * - signal：模型侧超时/取消，sendPrompt 的同步等待必须可取消。
 */
export interface ZCodeTaskPortRequestContext {
  sessionId: string;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

export interface ZCodeTaskPort {
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
    /** 默认 manual；实际 creator identity 由 Host 从受信会话上下文注入。 */
    approvalPolicy?: PeerSessionApprovalPolicy;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiTaskCreateResult>;

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
  } & ZCodeBackgroundTurnAttribution & ZCodeTaskPortRequestContext): Promise<ZCodeAiTaskPromptAdmission>;

  /** 停止当前正在进行的生成 */
  stopGeneration(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    runId?: TraceId;
  } & ZCodeTaskPortRequestContext): Promise<void>;

  /** 执行 agent 内建 /compact 命令 */
  compactSession(params: {
    taskId: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    inputId?: string;
    instructions?: string;
    expectedRevision?: number;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeSessionCompactResult>;

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
  } & ZCodeTaskPortRequestContext): Promise<ZCodeTaskMeta>;

  /** 列出 workspace 下所有已持久化的 task */
  listTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeTaskMeta[]>;

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
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiTaskSnapshot | null>;

  /** 切换模型，返回服务端 authoritative configOptions */
  setModel(params: {
    taskId: string;
    traceId: TraceId;
    modelSelection: ModelSelection;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiConfigOption[]>;
}
