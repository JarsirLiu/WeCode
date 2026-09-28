import {
  generateTraceId,
  normalizeBotReplyGranularity,
  type BotActor,
  type ZCodeConfigOption,
  type ZCodeProvider,
} from "@zcode/shared";
import { findBot, findBoundUser, isUserCommandAllowed } from "./botConfigHelpers.js";
import { filterAllowedWorkspaces, getWorkspaceKey, isWorkspaceAllowed } from "./workspaceHelpers.js";
import { taskStatus } from "./statusFormatting.js";
import {
  findSelectConfigOption,
  formatReplyGranularityLabel,
  formatWorkspaceOptionLabel,
  getReplyGranularityOptions,
  listConfigSelectOptions,
  readConfigSelectCurrentLabel,
  readConfigSelectLabelForValue,
} from "./botConfigSelectHelpers.js";
import type { BotAiAuthorizedContext, BotAiCommandDeps } from "./botAiCommandPolicy.js";
import {
  REMOTE_RECONNECT_DEDUPE_TTL_MS,
  msg,
  selectContext,
  type BotAiCommandBridgePrimitives,
} from "./botAiCommandBridgePrimitives.js";
import { createBotAiModelFlowDeps } from "./botAiModelFlow.js";

export {
  type BotRemoteWorkspaceReconnectResult,
  REMOTE_RECONNECT_DEDUPE_TTL_MS,
} from "./botAiCommandBridgePrimitives.js";

export function createBotAiCommandBridgeDeps(
  p: BotAiCommandBridgePrimitives,
): BotAiCommandDeps {
  const messages: BotAiCommandDeps["messages"] = {
    taskRunning: (auth) => msg(auth.locale, "taskRunning"),
    workspaceMissing: (auth) => msg(auth.locale, "workspaceMissing"),
    modelProviderMissing: (auth) => msg(auth.locale, "modelProviderMissing"),
    modelMissing: (auth) => msg(auth.locale, "modelMissing"),
    taskMissing: (auth) => msg(auth.locale, "taskMissing"),
    noHistoryTasks: (auth) => msg(auth.locale, "noHistoryTasks"),
    noActiveTask: (auth) => msg(auth.locale, "noActiveTask"),
    thoughtLevelMissing: (auth) => msg(auth.locale, "thoughtLevelMissing"),
    replyMissing: (auth) => msg(auth.locale, "replyMissing"),
  };

  async function resolveThoughtLevelSource(
    auth: BotAiAuthorizedContext,
  ): Promise<{ options: ZCodeConfigOption[]; provider?: ZCodeProvider }> {
    if (auth.context.mode === "draft" || !auth.context.activeTaskId) {
      const draftOptions = await p.ensureDraftOptions(auth.context);
      return {
        options: await p.listDraftConfigOptions(auth.context, draftOptions),
        provider: draftOptions.provider,
      };
    }
    return {
      options: await p.listActiveTaskConfigOptions(auth.context, auth.context.activeTaskId),
    };
  }

  return {
    messages,
    ...createBotAiModelFlowDeps(p),
    async resolveAuthorizedContext(botId, command) {
      const locale = await p.readMessageLocale();
      const config = await p.readConfig();
      const bot = findBot(config, botId);
      if (!bot) {
        return { ok: false, error: msg(locale, "botDisabled") };
      }
      // AI 命令没有入站消息 actor；受信身份是 botId 对应 bot 的当前唯一绑定用户，
      // context key 与该用户私聊一致，授权语义与 withAuthorizedContext 相同。
      const actor: BotActor = {
        botId: bot.id,
        provider: bot.provider,
        providerUserId: bot.providerUserId ?? "",
        chatType: "private",
      };
      const user = findBoundUser(bot, actor);
      if (!user) {
        return { ok: false, error: msg(locale, "userNotBound") };
      }
      if (!isUserCommandAllowed(user, command)) {
        return { ok: false, error: msg(locale, "commandNotAllowed") };
      }
      const context = await p.readContext(actor, bot);
      if (!context) {
        return { ok: false, error: msg(locale, "noWorkspaceAllowed") };
      }
      const synced = await p.normalizeBotWorkspaceConfig(
        config,
        bot,
        p.createCurrentWorkspaceRef(context),
      );
      if (
        context.workspaceId &&
        !isWorkspaceAllowed(context.workspaceId, synced.user.allowedWorkspaces)
      ) {
        return { ok: false, error: msg(locale, "workspaceOutOfScope") };
      }
      if (
        context.workspaceIdentity &&
        p.requiresRemoteWorkspaceRuntime(command) &&
        !(await p.isRemoteWorkspaceConnected(context))
      ) {
        return {
          ok: false,
          error: msg(locale, "remoteDisconnected", { workspacePath: context.workspacePath }),
        };
      }
      return { ok: true, auth: { bot: synced.bot, user: synced.user, context, locale } };
    },
    isContextActiveTaskRunning: (context) => p.isContextActiveTaskRunning(context),
    async listWorkspaceOptions(auth) {
      const synced = await p.normalizeBotWorkspaceConfig(
        await p.readConfig(),
        auth.bot,
        p.createCurrentWorkspaceRef(auth.context),
      );
      return filterAllowedWorkspaces(synced.workspaces, synced.user.allowedWorkspaces).map(
        (workspace) => ({
          id: workspace.id,
          label: formatWorkspaceOptionLabel(workspace, auth.locale),
        }),
      );
    },
    async applyWorkspaceSelection(auth, workspaceId) {
      const synced = await p.normalizeBotWorkspaceConfig(
        await p.readConfig(),
        auth.bot,
        p.createCurrentWorkspaceRef(auth.context),
      );
      const workspace = filterAllowedWorkspaces(
        synced.workspaces,
        synced.user.allowedWorkspaces,
      ).find((item) => item.id === workspaceId);
      if (!workspace) {
        return { ok: false, error: msg(auth.locale, "workspaceMissing") };
      }
      await p.writeDraftContext(
        {
          ...auth.context,
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
          workspaceId: workspace.id,
        },
        await p.buildInitializedDraftOptions({
          ...auth.context,
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
        }),
      );
      return { ok: true };
    },
    async listTaskOptions(auth) {
      const entries = (await p.listContextTaskSelectionEntries(auth.context, auth.user)).slice(
        0,
        10,
      );
      return entries.map((entry) => ({
        id: entry.task.taskId,
        label: entry.task.title,
        description: taskStatus(entry.task),
      }));
    },
    async readCurrentTaskLabel(auth) {
      return (await p.readContextActiveTaskMeta(auth.context))?.title;
    },
    async applyTaskSelection(auth, taskId) {
      const entries = await p.listContextTaskSelectionEntries(auth.context, auth.user);
      let entry = entries.find((item) => item.task.taskId === taskId);
      if (!entry) {
        const zcodeTaskService = await p.resolveZCodeTaskServiceForContext(auth.context);
        const snapshot = await zcodeTaskService
          .getTaskSnapshot({
            taskId,
            workspacePath: auth.context.workspacePath,
            workspaceIdentity: auth.context.workspaceIdentity,
          })
          .catch(() => null);
        if (!snapshot) {
          return { ok: false, error: msg(auth.locale, "taskMissing") };
        }
        entry = {
          task: snapshot.meta,
          workspacePath: auth.context.workspacePath,
          workspaceIdentity: auth.context.workspaceIdentity,
        };
      }
      if (
        auth.context.activeTaskId !== entry.task.taskId &&
        (await p.isContextActiveTaskRunning(auth.context))
      ) {
        // Bugfix: 运行中的旧 task 已建立第三方 stream 订阅；改写 activeTaskId 会让
        // 新输入落到新 task 而旧 task 输出继续回到同一会话，用户会误以为消息串线。
        return { ok: false, error: msg(auth.locale, "taskRunning") };
      }
      await p.writeContext({
        ...auth.context,
        workspacePath: entry.workspacePath,
        workspaceIdentity: entry.workspaceIdentity,
        workspaceId: getWorkspaceKey(entry.workspacePath, entry.workspaceIdentity),
        mode: "task",
        activeTaskId: entry.task.taskId,
      });
      return { ok: true };
    },
    async createTaskDraft(auth) {
      await p.writeDraftContext(auth.context, await p.buildActiveTaskDraftOptions(auth.context));
      return { ok: true };
    },
    async stopActiveTask(auth) {
      if (!auth.context.activeTaskId) {
        return { ok: false, error: msg(auth.locale, "noActiveTask") };
      }
      try {
        const zcodeTaskService = await p.resolveZCodeTaskServiceForContext(auth.context);
        await zcodeTaskService.stopGeneration({ taskId: auth.context.activeTaskId });
      } catch (error) {
        return {
          ok: false,
          error: msg(auth.locale, "taskFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        };
      }
      p.runningTasks.delete(auth.context.activeTaskId);
      p.stopTyping(auth.context.activeTaskId);
      await p.broadcastTaskListChange(auth.context, auth.context.activeTaskId, "updated");
      return { ok: true };
    },
    getStatusSummary: (auth) => p.buildStatusText(auth.context, auth.locale),
    async reconnectRemoteWorkspace(auth) {
      if (!auth.context.workspaceIdentity) {
        return { ok: true, statusText: msg(auth.locale, "remoteReconnectLocal") };
      }
      if (!p.remoteReconnectServiceAvailable()) {
        return {
          ok: false,
          message: msg(auth.locale, "remoteReconnectUnavailable", {
            workspacePath: auth.context.workspacePath,
          }),
        };
      }
      if (await p.isRemoteWorkspaceConnected(auth.context)) {
        return { ok: true, statusText: await p.buildStatusText(auth.context, auth.locale) };
      }
      const reconnectKey = `ai::${auth.bot.id}::${auth.context.workspaceIdentity}`;
      const pendingReconnect = p.pendingRemoteReconnects.get(reconnectKey);
      if (pendingReconnect) {
        await pendingReconnect.catch(() => undefined);
        return { ok: true, statusText: await p.buildStatusText(auth.context, auth.locale) };
      }
      const recentReconnectAt = p.recentRemoteReconnectAt.get(reconnectKey);
      if (
        recentReconnectAt !== undefined &&
        Date.now() - recentReconnectAt < REMOTE_RECONNECT_DEDUPE_TTL_MS
      ) {
        return { ok: true, statusText: await p.buildStatusText(auth.context, auth.locale) };
      }
      // 重连有副作用，必须按 bot+workspace 幂等，避免并发的 AI 调用重复触发。
      const reconnectPromise = (async (): Promise<{
        ok: boolean;
        statusText?: string;
        message?: string;
      }> => {
        const result = await p.reconnectRemoteWorkspace(auth.context).catch((error: unknown) => ({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }));
        if (!result.ok) {
          return {
            ok: false,
            message: msg(auth.locale, "remoteReconnectFailed", {
              workspacePath: auth.context.workspacePath,
              message: result.message ?? "unknown",
            }),
          };
        }
        if (auth.context.mode === "draft" || !auth.context.activeTaskId) {
          await p.writeContext({
            ...auth.context,
            draftOptions: await p.buildInitializedDraftOptions(auth.context),
          });
        }
        return { ok: true, statusText: await p.buildStatusText(auth.context, auth.locale) };
      })();
      p.pendingRemoteReconnects.set(reconnectKey, reconnectPromise);
      try {
        const result = await reconnectPromise;
        p.recentRemoteReconnectAt.set(reconnectKey, Date.now());
        return result;
      } finally {
        p.pendingRemoteReconnects.delete(reconnectKey);
      }
    },
    async listThoughtLevelOptions(auth) {
      const source = await resolveThoughtLevelSource(auth);
      return listConfigSelectOptions(source.options, "thoughtLevel", {
        locale: auth.locale,
        ...(source.provider ? { provider: source.provider } : {}),
      });
    },
    async readCurrentThoughtLevelLabel(auth) {
      const source = await resolveThoughtLevelSource(auth);
      if (source.provider) {
        const rawCurrentValue = findSelectConfigOption(source.options, "thoughtLevel")?.currentValue;
        const currentValue = typeof rawCurrentValue === "string" ? rawCurrentValue : undefined;
        return readConfigSelectLabelForValue(source.options, "thoughtLevel", currentValue, {
          locale: auth.locale,
          provider: source.provider,
        });
      }
      return readConfigSelectCurrentLabel(source.options, "thoughtLevel", {
        locale: auth.locale,
      });
    },
    async applyThoughtLevel(auth, thoughtLevel) {
      if (auth.context.mode === "draft" || !auth.context.activeTaskId) {
        const originalOptions = await p.ensureDraftOptions(auth.context);
        const view = await p.readModelSelectionView(auth.context, originalOptions.modelSelection);
        const displayOptions = listConfigSelectOptions(
          await p.listDraftConfigOptions(auth.context, originalOptions, view),
          "thoughtLevel",
          selectContext(auth, originalOptions.provider),
        );
        const option = displayOptions.find((candidate) => candidate.id === thoughtLevel);
        if (!option) {
          return { ok: false, error: msg(auth.locale, "thoughtLevelMissing") };
        }
        await p.writeDraftOptions(auth.context, {
          ...originalOptions,
          ...(originalOptions.modelSelection
            ? {
                modelSelection: {
                  ...originalOptions.modelSelection,
                  options: {
                    ...originalOptions.modelSelection.options,
                    reasoningLevel: option.id,
                  },
                },
              }
            : {}),
        });
        return { ok: true };
      }
      if (!auth.context.activeTaskId) {
        return { ok: false, error: msg(auth.locale, "noActiveTask") };
      }
      const configOptions = await p.listActiveTaskConfigOptions(
        auth.context,
        auth.context.activeTaskId,
      );
      const selectOption = findSelectConfigOption(configOptions, "thoughtLevel");
      const displayOptions = listConfigSelectOptions(configOptions, "thoughtLevel", {
        locale: auth.locale,
      });
      const option = displayOptions.find((candidate) => candidate.id === thoughtLevel);
      if (!option || !selectOption?.id) {
        return { ok: false, error: msg(auth.locale, "thoughtLevelMissing") };
      }
      const zcodeTaskService = await p.resolveZCodeTaskServiceForContext(auth.context);
      const nextConfigOptions = await zcodeTaskService.setConfigOption({
        taskId: auth.context.activeTaskId,
        traceId: generateTraceId(auth.context.activeTaskId),
        configId: selectOption.id,
        value: option.id,
      });
      await p.broadcastTaskConfigSync({
        context: auth.context,
        taskId: auth.context.activeTaskId,
        task: await p.readContextActiveTaskMeta(auth.context),
        configOptions: nextConfigOptions,
      });
      return { ok: true };
    },
    async listReplyOptions(auth) {
      return getReplyGranularityOptions(auth.locale, auth.bot.provider);
    },
    async readCurrentReplyLabel(auth) {
      return formatReplyGranularityLabel(auth.bot.replyMode, auth.locale, auth.bot.provider);
    },
    async applyReplyMode(auth, replyMode) {
      const option = getReplyGranularityOptions(auth.locale, auth.bot.provider).find(
        (item) => item.id === replyMode,
      );
      if (!option) {
        return { ok: false, error: msg(auth.locale, "replyMissing") };
      }
      await p.saveBot({
        bot: { ...auth.bot, replyMode: normalizeBotReplyGranularity(auth.bot.provider, option.id) },
      });
      return { ok: true };
    },
  };
}
