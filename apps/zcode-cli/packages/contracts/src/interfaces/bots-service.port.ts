// ============================================================
// BotsServicePort - AI Runtime 调用 Bot 命令的唯一端口
// ============================================================
//
// 微信等渠道 Bot 的 AI 命令入口（spec: docs/specs/bot-weixin-ai-commands.md）。
// Host 侧由 IBotsService 实现事实与授权；本文件只做结构镜像，不 import services
// 与 @zcode/shared 的 zod schema，避免跨包 zod 版本耦合（与 browser-control.port.ts 同约定）。

import type { TraceContext } from "../tracing/tracer.js";

export type BotsCommandName =
  | "model"
  | "workspace"
  | "task"
  | "status"
  | "reconnect"
  | "new"
  | "stop"
  | "thoughtLevel"
  | "reply";

export type BotsCommandAction = "list" | "set" | "execute";

export interface BotsCommandPayload {
  providerId?: string;
  modelId?: string;
  workspaceId?: string;
  taskId?: string;
  thoughtLevel?: string;
  replyMode?: string;
}

export interface BotsCommandOption {
  id: string;
  label: string;
  description?: string;
  isCurrent?: boolean;
}

export type BotsCommandStep =
  | "select_provider"
  | "select_model"
  | "select_workspace"
  | "select_task"
  | "select_thought_level"
  | "select_reply"
  | "done";

export interface BotsCommandExecutionResult {
  success: boolean;
  step?: BotsCommandStep;
  /** 结构化选项；渠道侧是否渲染成卡片由 Host 决定，文本渠道同时给 textGuidance。 */
  options?: BotsCommandOption[];
  /** 纯文本渠道（微信）的数字选择引导文案。 */
  textGuidance?: string;
  currentValue?: string;
  message?: string;
  error?: string;
}

export interface BotsCommandExecutionInput {
  sessionId: string;
  turnId?: string;
  command: BotsCommandName;
  action: BotsCommandAction;
  payload?: BotsCommandPayload;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

/**
 * Bot 命令端口。botId、channel、workspaceIdentity、remoteSessionId 与 clientMode
 * 一律由 Host 从受信 session 元数据解析，模型输入中的替代值必须被忽略。
 */
export interface BotsServicePort {
  executeBotCommand(input: BotsCommandExecutionInput): Promise<BotsCommandExecutionResult>;
}
