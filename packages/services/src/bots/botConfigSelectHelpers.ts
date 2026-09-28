import {
  decodeCustomModelValue,
  encodeCustomModelValue,
  getSupportedBotReplyGranularities,
  normalizeBotReplyGranularity,
  ZCODE_AGENT_PROVIDER,
  type BotProvider,
  type BotReplyGranularity,
  type BotWorkspaceRef,
  type Locale,
  type ModelSelection,
  type ZCodeConfigOption,
  type ZCodeProvider,
  type ZCodeTaskMeta,
} from "@zcode/shared";
import { getDefaultBotReplyGranularity } from "./config.js";

// Bot 手动命令与 AI 命令共用的选择模型类型和纯 helper。无 IO、无可变状态。

export interface BotModelOption {
  id: string;
  label: string;
  description?: string;
}

export interface BotModelProviderOption {
  id: string;
  label: string;
  description?: string;
  models: BotModelOption[];
}

export interface BotTaskSelectionEntry {
  task: ZCodeTaskMeta;
  workspacePath: string;
  workspaceIdentity?: string;
}

export function formatBotModelSelectionValue(
  selection: ModelSelection | undefined,
): string | undefined {
  if (!selection) return undefined;
  return selection.providerId === ZCODE_AGENT_PROVIDER
    ? selection.modelId
    : encodeCustomModelValue(selection.providerId, selection.modelId);
}

export function parseBotModelOptionValue(value: string): ModelSelection | undefined {
  const decoded = decodeCustomModelValue(value);
  if (decoded?.providerId && decoded.modelName) {
    return { providerId: decoded.providerId, modelId: decoded.modelName };
  }
  const separatorIndex = value.indexOf("/");
  if (separatorIndex > 0 && separatorIndex < value.length - 1) {
    return {
      providerId: value.slice(0, separatorIndex),
      modelId: value.slice(separatorIndex + 1),
    };
  }
  return value.trim() ? { providerId: ZCODE_AGENT_PROVIDER, modelId: value.trim() } : undefined;
}

export const BOT_REPLY_GRANULARITY_OPTIONS = [
  {
    id: "assistant_changes",
    label: { "zh-CN": "标准回复", "en-US": "Standard reply" },
    aliases: ["assistant", "assistant_changes", "normal", "default", "standard", "标准回复"],
  },
  {
    id: "assistant_toolcalls_changes",
    label: { "zh-CN": "完整回复", "en-US": "Full reply" },
    aliases: ["full", "tool", "toolcalls", "assistant_toolcalls_changes", "完整回复"],
  },
  {
    id: "summary_changes",
    label: { "zh-CN": "摘要回复", "en-US": "Summary reply" },
    aliases: ["summary", "summary_changes", "latest", "摘要回复"],
  },
  {
    id: "streaming_card",
    label: { "zh-CN": "流式卡片", "en-US": "Streaming card" },
    aliases: ["stream", "streaming", "streaming_card", "流式", "流式卡片"],
  },
] as const satisfies ReadonlyArray<{
  id: BotReplyGranularity;
  label: Record<"zh-CN" | "en-US", string>;
  aliases: readonly string[];
}>;

export function getReplyGranularityOptions(locale: Locale | undefined, provider?: BotProvider) {
  const messageLocale = locale === "en-US" ? "en-US" : "zh-CN";
  const supportedIds = provider ? new Set(getSupportedBotReplyGranularities(provider)) : null;
  return BOT_REPLY_GRANULARITY_OPTIONS.filter(
    (option) => !supportedIds || supportedIds.has(option.id),
  ).map((option) => ({
    id: option.id,
    label: option.label[messageLocale],
  }));
}

export function formatReplyGranularityLabel(
  id: BotReplyGranularity | undefined,
  locale: Locale | undefined,
  provider?: BotProvider,
): string {
  const currentId = provider
    ? normalizeBotReplyGranularity(provider, id)
    : (id ?? getDefaultBotReplyGranularity());
  return (
    getReplyGranularityOptions(locale, provider).find((option) => option.id === currentId)
      ?.label ?? currentId
  );
}

export function formatWorkspaceOptionLabel(workspace: BotWorkspaceRef, locale?: Locale): string {
  if (!workspace.workspaceIdentity) {
    return workspace.label;
  }
  const remoteLabel = locale === "en-US" ? "[Remote]" : "[远端]";
  return `${workspace.label} ${remoteLabel}`;
}

export function findSelectConfigOption(
  options: readonly ZCodeConfigOption[],
  configId: "model" | "mode" | "thoughtLevel",
): (ZCodeConfigOption & { type: "select" }) | undefined {
  const category = configId === "thoughtLevel" ? "thought_level" : configId;
  return options.find(
    (item): item is ZCodeConfigOption & { type: "select" } =>
      item.type === "select" && (item.category === category || item.id === category),
  );
}

export function listConfigSelectOptions(
  options: readonly ZCodeConfigOption[],
  configId: "model" | "mode" | "thoughtLevel",
  context: { locale?: Locale; provider?: ZCodeProvider } = {},
): BotModelOption[] {
  const option = findSelectConfigOption(options, configId);
  return (option?.options ?? []).map((item) => {
    const baseOption = {
      id: item.value,
      label: item.name,
      description: item.description,
    };
    return {
      ...baseOption,
      // 保持 Bot 与工具栏的模式展示一致。
      label: formatConfigOptionLabel(baseOption, {
        configId,
        locale: context.locale,
        provider: context.provider,
      }),
    };
  });
}

export function readConfigSelectCurrentValue(
  options: readonly ZCodeConfigOption[],
  configId: "model" | "mode" | "thoughtLevel",
): string | undefined {
  const currentValue = findSelectConfigOption(options, configId)?.currentValue;
  return typeof currentValue === "string" ? currentValue : undefined;
}

export function readConfigSelectCurrentLabel(
  options: readonly ZCodeConfigOption[],
  configId: "model" | "mode" | "thoughtLevel",
  context: { locale?: Locale; provider?: ZCodeProvider } = {},
): string | undefined {
  const currentValue = readConfigSelectCurrentValue(options, configId);
  if (!currentValue) {
    return undefined;
  }
  return (
    listConfigSelectOptions(options, configId, context).find(
      (option) => option.id === currentValue,
    )?.label ?? currentValue
  );
}

export function readConfigSelectLabelForValue(
  options: readonly ZCodeConfigOption[],
  configId: "model" | "mode" | "thoughtLevel",
  value: string | undefined,
  context: { locale?: Locale; provider?: ZCodeProvider } = {},
): string | undefined {
  if (!value) {
    return undefined;
  }
  return (
    listConfigSelectOptions(options, configId, context).find((option) => option.id === value)
      ?.label ?? value
  );
}

function getModeDisplayLabel(
  locale: Locale | undefined,
  provider: ZCodeProvider | undefined,
  option: Pick<BotModelOption, "id" | "label">,
): string {
  if (!provider) {
    return option.label;
  }
  const isEnglish = locale === "en-US";
  const labels: Partial<Record<ZCodeProvider, Record<string, string>>> = {
    glm: {
      default: isEnglish ? "Default" : "默认",
      yolo: "Yolo",
      plan: isEnglish ? "Plan" : "计划",
    },
  };
  return labels[provider]?.[option.id] ?? option.label;
}

function formatConfigOptionLabel(
  option: BotModelOption,
  context: {
    configId: "model" | "mode" | "thoughtLevel";
    locale?: Locale;
    provider?: ZCodeProvider;
  },
): string {
  if (context.configId !== "mode") {
    return option.label;
  }
  return getModeDisplayLabel(context.locale, context.provider, option);
}
