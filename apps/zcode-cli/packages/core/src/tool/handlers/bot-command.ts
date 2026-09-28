// ============================================================
// BotCommand Tool Handler
// ============================================================
//
// 微信等渠道 Bot 的 AI 命令统一入口（spec: docs/specs/bot-weixin-ai-commands.md）。
// handler 只做参数校验与端口调用；botId/channel/workspace 元数据由 Host 从受信
// session 解析，模型输入里没有也不允许出现身份字段。端口缺席时本工具不注册。

import {
  BOT_COMMAND_DESCRIPTION,
  BOT_COMMAND_TOOL_NAME,
  BotCommandInputJsonSchema,
  BotCommandInputSchema,
  BotCommandOutputJsonSchema,
  BotCommandOutputSchema,
  CoreErrorType,
  createCoreError,
  type BotCommandOutput,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const MAX_BOT_COMMAND_MODEL_BYTES = 100_000;
const BOT_COMMAND_TIMEOUT_MS = 60_000;

const botCommandHandler: ToolHandler = async (input, context) => {
  const parsed = BotCommandInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid BotCommand input", {
      context: {
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
        toolCallId: context.toolCallId,
        toolName: BOT_COMMAND_TOOL_NAME,
      },
      recoverable: true,
    });
  }
  if (!context.botsServicePort) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "Bot command service is not available in this session",
      {
        context: { toolCallId: context.toolCallId, toolName: BOT_COMMAND_TOOL_NAME },
        recoverable: true,
      },
    );
  }
  const { command, action, payload } = parsed.data;
  return context.botsServicePort.executeBotCommand({
    sessionId: context.sessionId,
    ...(context.turnId ? { turnId: context.turnId } : {}),
    command,
    action,
    ...(payload ? { payload } : {}),
    ...(context.traceContext ? { traceContext: context.traceContext } : {}),
    signal: context.abortSignal,
  }) as Promise<BotCommandOutput>;
};

export const botCommandToolEntry: ToolEntry = {
  capability: "Operate the user's connected messaging bot (switch model/workspace/task, status, reconnect)",
  metadata: {
    name: BOT_COMMAND_TOOL_NAME,
    description: BOT_COMMAND_DESCRIPTION,
    readOnly: false,
    destructive: false,
    // set/execute 会改写 Bot context（模型、工作区、任务）；并发调用可能交错，禁止并发。
    concurrentSafe: false,
    timeoutMs: BOT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: MAX_BOT_COMMAND_MODEL_BYTES,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: botCommandHandler,
  inputSchema: BotCommandInputJsonSchema,
  outputSchema: BotCommandOutputJsonSchema,
  runtimeInputSchema: BotCommandInputSchema,
  runtimeOutputSchema: BotCommandOutputSchema,
  permission: {
    permission: "bots.command",
    reason: "BotCommand changes the user's bot state (model, workspace, tasks)",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: MAX_BOT_COMMAND_MODEL_BYTES,
    maxModelBytes: MAX_BOT_COMMAND_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: MAX_BOT_COMMAND_MODEL_BYTES,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: BOT_COMMAND_TIMEOUT_MS,
    maxMs: BOT_COMMAND_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "BotCommand was cancelled before the host confirmed the change",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
