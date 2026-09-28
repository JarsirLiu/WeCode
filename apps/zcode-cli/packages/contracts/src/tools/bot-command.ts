// ============================================================
// BotCommand Tool - 微信等渠道 Bot 的 AI 命令统一入口
// ============================================================
//
// spec: docs/specs/bot-weixin-ai-commands.md。单一工具覆盖 model/workspace/task/
// status/reconnect/new/stop/thoughtLevel/reply 的 list/set/execute；多步选择由模型
// 上下文承接（list 拿选项 → 用户回复数字 → 模型映射回选项 id → set 提交）。
// botId/channel/workspace 元数据由受信链路注入，输入 schema 不给模型任何身份字段。

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const BOT_COMMAND_TOOL_NAME = "BotCommand";

export const BotCommandNameSchema = z.enum([
  "model",
  "workspace",
  "task",
  "status",
  "reconnect",
  "new",
  "stop",
  "thoughtLevel",
  "reply",
]);

export const BotCommandActionSchema = z.enum(["list", "set", "execute"]);

export const BotCommandPayloadSchema = z
  .object({
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    thoughtLevel: z.string().min(1).optional(),
    replyMode: z.string().min(1).optional(),
  })
  .strict();

export const BotCommandInputSchema = z
  .object({
    command: BotCommandNameSchema,
    action: BotCommandActionSchema,
    payload: BotCommandPayloadSchema.optional(),
  })
  .strict();

export type BotCommandInput = z.infer<typeof BotCommandInputSchema>;

export const BotCommandOptionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    isCurrent: z.boolean().optional(),
  })
  .strict();

export const BotCommandOutputSchema = z
  .object({
    success: z.boolean(),
    step: z
      .enum([
        "select_provider",
        "select_model",
        "select_workspace",
        "select_task",
        "select_thought_level",
        "select_reply",
        "done",
      ])
      .optional(),
    options: z.array(BotCommandOptionSchema).optional(),
    textGuidance: z.string().optional(),
    currentValue: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

export type BotCommandOutput = z.infer<typeof BotCommandOutputSchema>;

export const BotCommandInputJsonSchema = toToolJsonSchema(BotCommandInputSchema);
export const BotCommandOutputJsonSchema = toToolJsonSchema(BotCommandOutputSchema);

export const BOT_COMMAND_DESCRIPTION = [
  "Manage the user's connected messaging bot (WeChat and similar channels) through the host app.",
  "",
  "Commands: model (switch model), workspace (switch workspace), task (list/switch tasks),",
  "new (create a task draft), stop (stop the running task), status (current status),",
  "reconnect (reconnect a remote workspace), thoughtLevel (query/set reasoning level),",
  "reply (reply detail level; unsupported on WeChat).",
  "",
  "Multi-step selection protocol:",
  "1. Call with action \"list\" first; the result carries `options` (id + label) and, on",
  "   text-only channels, ready-to-send `textGuidance`.",
  "2. Present the options as a numbered list and wait for the user's reply.",
  "3. Map the user's numeric reply back to the exact option id (never invent ids) and call",
  "   with action \"set\" and the matching payload field (providerId, workspaceId, taskId,",
  "   thoughtLevel, or replyMode). For model selection, first \"set\" providerId to get the",
  "   model list, then \"set\" modelId to apply.",
  "",
  "Actions `new`, `stop` and `set` mutate bot state; `status`, `reconnect` and `list` are read-only.",
  "A result with success=false carries an `error` message: report it to the user as-is and",
  "suggest the manual /commands (e.g. /model, /workspace) as fallback.",
].join("\n");
