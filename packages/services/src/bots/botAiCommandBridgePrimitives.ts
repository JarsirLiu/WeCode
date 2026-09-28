import type { ModelSelectionView } from "@zcode/provider";
import {
  type BotActor,
  type BotConfig,
  type BotContextState,
  type BotDraftOptions,
  type BotWorkspaceRef,
  type BotsConfigFile,
  type Locale,
  type ModelSelection,
  type ZCodeConfigOption,
  type ZCodeProvider,
  type ZCodeTaskMeta,
} from "@zcode/shared";
import type { IZCodeTaskService } from "../session/zcodeTaskService.js";
import type { BotSaveBotParams } from "./bots.js";
import type {
  BotAiAuthorizedContext,
  BotAiCommandName,
} from "./botAiCommandPolicy.js";
import { formatBotMessage, type BotMessageId } from "./messages.js";
import type {
  BotModelOption,
  BotModelProviderOption,
  BotTaskSelectionEntry,
} from "./botConfigSelectHelpers.js";

export interface BotRemoteWorkspaceReconnectResult {
  ok: boolean;
  message?: string;
}

/** 与 /reconnect 相同的重连副作用幂等窗口；手动命令与 AI 命令共用同一 TTL。 */
export const REMOTE_RECONNECT_DEDUPE_TTL_MS = 3_000;

/**
 * createBotsService 闭包注入的原语集。AI 命令流程（bridge/flow 文件）只通过这些
 * 原语访问 Bot context、任务服务与广播副作用；命令事实与授权的唯一所有者仍是
 * botsService.ts。
 */
export interface BotAiCommandBridgePrimitives {
  readMessageLocale(): Promise<Locale | undefined>;
  readConfig(): Promise<BotsConfigFile>;
  readContext(actor: BotActor, bot: BotConfig): Promise<BotContextState | null>;
  writeContext(context: BotContextState): Promise<void>;
  writeDraftContext(
    context: BotContextState,
    draftOptions?: BotDraftOptions,
  ): Promise<BotContextState>;
  normalizeBotWorkspaceConfig(
    config: BotsConfigFile,
    bot: BotConfig,
    currentWorkspace: BotWorkspaceRef,
  ): Promise<{
    config: BotsConfigFile;
    bot: BotConfig;
    user: BotConfig;
    workspaces: BotWorkspaceRef[];
  }>;
  createCurrentWorkspaceRef(context: BotContextState): BotWorkspaceRef;
  requiresRemoteWorkspaceRuntime(command: BotAiCommandName): boolean;
  isRemoteWorkspaceConnected(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
  ): Promise<boolean>;
  isContextActiveTaskRunning(context: BotContextState): Promise<boolean>;
  reconnectRemoteWorkspace(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
  ): Promise<BotRemoteWorkspaceReconnectResult>;
  readContextActiveTaskMeta(context: BotContextState): Promise<ZCodeTaskMeta | null>;
  listActiveTaskConfigOptions(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
    taskId: string,
  ): Promise<ZCodeConfigOption[]>;
  resolveDraftOptionsForDisplay(context: BotContextState): Promise<BotDraftOptions>;
  ensureDraftOptions(context: BotContextState): Promise<BotDraftOptions>;
  writeDraftOptions(context: BotContextState, draftOptions: BotDraftOptions): Promise<BotContextState>;
  buildInitializedDraftOptions(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
    provider?: ZCodeProvider,
  ): Promise<BotDraftOptions>;
  buildActiveTaskDraftOptions(context: BotContextState): Promise<BotDraftOptions>;
  listDraftConfigOptions(
    context: BotContextState,
    draftOptions: BotDraftOptions,
    resolvedView?: ModelSelectionView | null,
  ): Promise<ZCodeConfigOption[]>;
  /** 远端重连服务未注入时 /reconnect 与 AI 重连都必须显式失败，不能静默当作已连接。 */
  remoteReconnectServiceAvailable(): boolean;
  readModelSelectionView(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
    selection?: ModelSelection,
  ): Promise<ModelSelectionView | null>;
  listModelProviderOptions(
    task: AiTaskRef,
    activeProvider: ZCodeProvider,
  ): Promise<BotModelProviderOption[]>;
  listModelOptionsForProvider(
    task: AiTaskRef,
    activeProvider: ZCodeProvider,
    providerId: string,
  ): Promise<BotModelOption[]>;
  listAllModelOptions(
    task: AiTaskRef,
    activeProvider: ZCodeProvider,
  ): Promise<BotModelOption[]>;
  readCurrentActiveTaskModel(
    task: Pick<ZCodeTaskMeta, "model">,
    options: readonly ZCodeConfigOption[],
  ): string | undefined;
  formatStatusModelLabel(
    model: string | undefined,
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
  ): Promise<string>;
  resolveCustomModelRuntimeId(
    activeProvider: ZCodeProvider,
    customModel: { providerId: string; modelName?: string },
  ): string | undefined;
  listContextTaskSelectionEntries(
    context: BotContextState,
    user: BotConfig,
  ): Promise<BotTaskSelectionEntry[]>;
  resolveZCodeTaskServiceForContext(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
  ): Promise<IZCodeTaskService>;
  buildStatusText(context: BotContextState, locale: Locale | undefined): Promise<string>;
  broadcastTaskListChange(
    context: Pick<BotContextState, "workspacePath" | "workspaceIdentity">,
    taskId: string,
    event: "updated",
    extras?: Record<string, unknown>,
  ): Promise<void>;
  broadcastTaskConfigSync(params: {
    context: BotContextState;
    taskId: string;
    task?: ZCodeTaskMeta | null;
    provider?: ZCodeProvider;
    configOptions?: ZCodeConfigOption[];
  }): Promise<void>;
  stopTyping(taskId: string): void;
  runningTasks: Set<string>;
  pendingRemoteReconnects: Map<string, Promise<unknown>>;
  recentRemoteReconnectAt: Map<string, number>;
  saveBot(params: BotSaveBotParams): Promise<BotConfig>;
}

export type AiTaskRef = Pick<ZCodeTaskMeta, "model" | "workspacePath" | "workspaceIdentity">;

export function msg(
  locale: Locale | undefined,
  id: BotMessageId,
  values?: Record<string, string | number | undefined>,
): string {
  return formatBotMessage(locale, id, values);
}

export function selectContext(
  auth: BotAiAuthorizedContext,
  provider?: ZCodeProvider,
): { locale?: Locale; provider?: ZCodeProvider } {
  return provider ? { locale: auth.locale, provider } : { locale: auth.locale };
}
