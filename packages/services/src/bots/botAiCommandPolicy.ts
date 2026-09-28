import type { BotConfig, BotContextState, BotProvider, Locale } from "@zcode/shared";

// AI 命令策略与契约（纯逻辑，无可变状态）。命令事实、授权和 Bot context 的唯一
// 所有者仍是 botsService.ts 的 IBotsService；AI 多步选择的中间态由模型上下文承接，
// 不得新增第二份 pending selection map。

export type BotAiCommandName =
  | "model"
  | "workspace"
  | "task"
  | "status"
  | "reconnect"
  | "new"
  | "stop"
  | "thoughtLevel"
  | "reply"
  | "mode";

export type BotAiCommandAction = "list" | "set" | "execute";

export interface BotAiCommandParams {
  command: BotAiCommandName;
  action: BotAiCommandAction;
  payload?: {
    providerId?: string;
    modelId?: string;
    workspaceId?: string;
    taskId?: string;
    thoughtLevel?: string;
    replyMode?: string;
  };
}

export interface BotAiCommandOption {
  id: string;
  label: string;
  description?: string;
  isCurrent?: boolean;
}

export interface BotAiModelProviderOption {
  id: string;
  label: string;
  models: BotAiCommandOption[];
}

export type BotAiCommandStep =
  | "select_provider"
  | "select_model"
  | "select_workspace"
  | "select_task"
  | "select_thought_level"
  | "select_reply"
  | "done";

export interface BotAiCommandResult {
  success: boolean;
  step?: BotAiCommandStep;
  options?: BotAiCommandOption[];
  textGuidance?: string;
  currentValue?: string;
  message?: string;
  error?: string;
}

export interface BotChannelCapabilities {
  supportsStructuredSelection: boolean;
  supportsMarkdown: boolean;
  supportsStreaming: boolean;
  supportsPermissionButtons: boolean;
  maxMessageLength: number;
}

const TEXT_ONLY_MAX_MESSAGE_LENGTH = 2048;
const RICH_MAX_MESSAGE_LENGTH = 4096;

function isFeishuLikeProvider(provider: BotProvider): boolean {
  return provider === "feishu" || provider === "lark";
}

export function getBotChannelCapabilities(channel: BotProvider): BotChannelCapabilities {
  const supportsStructuredSelection = isFeishuLikeProvider(channel) || channel === "telegram";
  return {
    supportsStructuredSelection,
    supportsMarkdown: channel !== "weixin",
    supportsStreaming: isFeishuLikeProvider(channel),
    supportsPermissionButtons: channel !== "weixin",
    maxMessageLength: supportsStructuredSelection
      ? RICH_MAX_MESSAGE_LENGTH
      : TEXT_ONLY_MAX_MESSAGE_LENGTH,
  };
}

export function isBotAiCommandSupported(command: BotAiCommandName, channel: BotProvider): boolean {
  if (command === "mode") {
    return false;
  }
  if (command === "reply") {
    return getBotChannelCapabilities(channel).supportsStructuredSelection;
  }
  return true;
}

export function getBotAiCommandUnsupportedReason(command: BotAiCommandName): string {
  if (command === "mode") {
    return "Bot 强制 yolo 模式，不支持切换";
  }
  if (command === "reply") {
    return "当前渠道不支持切换回复详细度，仅飞书/Lark/Telegram 支持";
  }
  return "当前环境不支持该命令";
}

export function buildTextGuidance(
  title: string,
  options: readonly BotAiCommandOption[],
  currentValue?: string,
): string {
  const lines = options.map((option, index) => {
    const suffix = option.description ? ` ${option.description}` : "";
    return `${index + 1}. ${option.label}${suffix}`;
  });
  const currentLine = currentValue ? `当前: ${currentValue}\n` : "";
  return `${currentLine}${title}\n${lines.join("\n")}\n\n请回复数字选择`;
}

export interface BotAiAuthorizedContext {
  bot: BotConfig;
  user: BotConfig;
  context: BotContextState;
  locale: Locale | undefined;
}

export type BotAiCommandResolution =
  | { ok: true; auth: BotAiAuthorizedContext }
  | { ok: false; error: string };

export type BotAiCommandApplyResult = { ok: true } | { ok: false; error: string };

export interface BotAiCommandMessages {
  taskRunning(auth: BotAiAuthorizedContext): string;
  workspaceMissing(auth: BotAiAuthorizedContext): string;
  modelProviderMissing(auth: BotAiAuthorizedContext): string;
  modelMissing(auth: BotAiAuthorizedContext): string;
  taskMissing(auth: BotAiAuthorizedContext): string;
  noHistoryTasks(auth: BotAiAuthorizedContext): string;
  noActiveTask(auth: BotAiAuthorizedContext): string;
  thoughtLevelMissing(auth: BotAiAuthorizedContext): string;
  replyMissing(auth: BotAiAuthorizedContext): string;
}

/**
 * 窄依赖契约：由 createBotsService 闭包注入，执行器借此复用既有命令事实与授权边界，
 * 自身不接触 repo、bot state 或任务服务实现。
 */
export interface BotAiCommandDeps {
  resolveAuthorizedContext(
    botId: string,
    command: BotAiCommandName,
  ): Promise<BotAiCommandResolution>;
  isContextActiveTaskRunning(context: BotContextState): Promise<boolean>;
  messages: BotAiCommandMessages;

  listWorkspaceOptions(auth: BotAiAuthorizedContext): Promise<BotAiCommandOption[]>;
  applyWorkspaceSelection(
    auth: BotAiAuthorizedContext,
    workspaceId: string,
  ): Promise<BotAiCommandApplyResult>;

  listModelProviderOptions(auth: BotAiAuthorizedContext): Promise<BotAiModelProviderOption[]>;
  listModelOptionsForProvider(
    auth: BotAiAuthorizedContext,
    providerId: string,
  ): Promise<BotAiCommandOption[]>;
  readCurrentModelLabel(auth: BotAiAuthorizedContext): Promise<string | undefined>;
  applyModelSelection(auth: BotAiAuthorizedContext, modelId: string): Promise<BotAiCommandApplyResult>;

  listTaskOptions(auth: BotAiAuthorizedContext): Promise<BotAiCommandOption[]>;
  readCurrentTaskLabel(auth: BotAiAuthorizedContext): Promise<string | undefined>;
  applyTaskSelection(auth: BotAiAuthorizedContext, taskId: string): Promise<BotAiCommandApplyResult>;
  createTaskDraft(auth: BotAiAuthorizedContext): Promise<BotAiCommandApplyResult>;
  stopActiveTask(auth: BotAiAuthorizedContext): Promise<BotAiCommandApplyResult>;

  getStatusSummary(auth: BotAiAuthorizedContext): Promise<string>;
  reconnectRemoteWorkspace(
    auth: BotAiAuthorizedContext,
  ): Promise<{ ok: boolean; statusText?: string; message?: string }>;

  listThoughtLevelOptions(auth: BotAiAuthorizedContext): Promise<BotAiCommandOption[]>;
  readCurrentThoughtLevelLabel(auth: BotAiAuthorizedContext): Promise<string | undefined>;
  applyThoughtLevel(
    auth: BotAiAuthorizedContext,
    thoughtLevel: string,
  ): Promise<BotAiCommandApplyResult>;

  listReplyOptions(auth: BotAiAuthorizedContext): Promise<BotAiCommandOption[]>;
  readCurrentReplyLabel(auth: BotAiAuthorizedContext): Promise<string | undefined>;
  applyReplyMode(auth: BotAiAuthorizedContext, replyMode: string): Promise<BotAiCommandApplyResult>;
}

export interface BotAiCommandExecutionInput extends BotAiCommandParams {
  botId: string;
  channel: BotProvider;
}

export type BotAiCommandExecutor = (
  input: BotAiCommandExecutionInput,
) => Promise<BotAiCommandResult>;
