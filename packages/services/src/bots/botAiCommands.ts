import {
  buildTextGuidance,
  getBotAiCommandUnsupportedReason,
  getBotChannelCapabilities,
  isBotAiCommandSupported,
  type BotAiAuthorizedContext,
  type BotAiCommandAction,
  type BotAiCommandDeps,
  type BotAiCommandExecutionInput,
  type BotAiCommandExecutor,
  type BotAiCommandOption,
  type BotAiCommandParams,
  type BotAiCommandResult,
  type BotAiCommandStep,
  type BotChannelCapabilities,
} from "./botAiCommandPolicy.js";

// AI 命令编排只住在本文件；命令事实与授权由 botsService.ts 通过 BotAiCommandDeps 注入。

function failure(error: string): BotAiCommandResult {
  return { success: false, error };
}

function markCurrentOption(
  options: readonly BotAiCommandOption[],
  currentId: string | undefined,
): BotAiCommandOption[] {
  if (!currentId) {
    return [...options];
  }
  return options.map((option) => ({
    ...option,
    isCurrent: option.id === currentId,
  }));
}

export function createBotAiCommandExecutor(deps: BotAiCommandDeps): BotAiCommandExecutor {
  async function guardSelectionCommand(
    auth: BotAiAuthorizedContext,
  ): Promise<BotAiCommandResult | null> {
    if (await deps.isContextActiveTaskRunning(auth.context)) {
      return failure(deps.messages.taskRunning(auth));
    }
    return null;
  }

  function finalizeSelection(
    step: BotAiCommandStep,
    options: readonly BotAiCommandOption[],
    caps: BotChannelCapabilities,
    title: string,
    currentValue: string | undefined,
  ): BotAiCommandResult {
    if (caps.supportsStructuredSelection) {
      return { success: true, step, options: [...options], currentValue };
    }
    return {
      success: true,
      step,
      options: [...options],
      textGuidance: buildTextGuidance(title, options, currentValue),
    };
  }

  async function executeModel(
    auth: BotAiAuthorizedContext,
    action: BotAiCommandAction,
    payload: BotAiCommandParams["payload"],
    channel: BotAiCommandExecutionInput["channel"],
  ): Promise<BotAiCommandResult> {
    const caps = getBotChannelCapabilities(channel);
    const running = await guardSelectionCommand(auth);
    if (running) return running;
    if (action === "list") {
      const providers = await deps.listModelProviderOptions(auth);
      if (providers.length === 0) {
        return failure(deps.messages.modelProviderMissing(auth));
      }
      const currentValue = await deps.readCurrentModelLabel(auth);
      return finalizeSelection(
        "select_provider",
        providers.map((provider) => ({ id: provider.id, label: provider.label })),
        caps,
        "请选择模型供应商",
        currentValue,
      );
    }
    if (action === "set" && payload?.providerId && !payload.modelId) {
      const provider = (await deps.listModelProviderOptions(auth)).find(
        (item) => item.id === payload.providerId,
      );
      if (!provider) {
        return failure(deps.messages.modelProviderMissing(auth));
      }
      const models =
        provider.models.length > 0
          ? provider.models
          : await deps.listModelOptionsForProvider(auth, provider.id);
      if (models.length === 0) {
        return failure(deps.messages.modelMissing(auth));
      }
      return finalizeSelection("select_model", models, caps, "请选择模型", undefined);
    }
    if (action === "set" && payload?.modelId) {
      const applied = await deps.applyModelSelection(auth, payload.modelId);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done", message: await deps.readCurrentModelLabel(auth) };
    }
    return failure(deps.messages.modelProviderMissing(auth));
  }

  async function executeWorkspace(
    auth: BotAiAuthorizedContext,
    action: BotAiCommandAction,
    payload: BotAiCommandParams["payload"],
    channel: BotAiCommandExecutionInput["channel"],
  ): Promise<BotAiCommandResult> {
    const caps = getBotChannelCapabilities(channel);
    if (action === "list") {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const options = await deps.listWorkspaceOptions(auth);
      if (options.length === 0) {
        return failure(deps.messages.workspaceMissing(auth));
      }
      return finalizeSelection(
        "select_workspace",
        markCurrentOption(options, auth.context.workspaceId ?? undefined),
        caps,
        "请选择工作区",
        auth.context.workspacePath,
      );
    }
    if (action === "set" && payload?.workspaceId) {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const applied = await deps.applyWorkspaceSelection(auth, payload.workspaceId);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done" };
    }
    return failure(deps.messages.workspaceMissing(auth));
  }

  async function executeTask(
    auth: BotAiAuthorizedContext,
    action: BotAiCommandAction,
    payload: BotAiCommandParams["payload"],
    channel: BotAiCommandExecutionInput["channel"],
  ): Promise<BotAiCommandResult> {
    const caps = getBotChannelCapabilities(channel);
    if (action === "list") {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const options = await deps.listTaskOptions(auth);
      if (options.length === 0) {
        return failure(deps.messages.noHistoryTasks(auth));
      }
      const currentLabel = await deps.readCurrentTaskLabel(auth);
      return finalizeSelection(
        "select_task",
        options,
        caps,
        "请选择任务",
        currentLabel ?? auth.context.activeTaskId ?? undefined,
      );
    }
    if (action === "set" && payload?.taskId) {
      const applied = await deps.applyTaskSelection(auth, payload.taskId);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done" };
    }
    if (action === "execute") {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const applied = await deps.createTaskDraft(auth);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done", message: "已创建新任务草稿，请发送任务需求" };
    }
    return failure(deps.messages.taskMissing(auth));
  }

  async function executeThoughtLevel(
    auth: BotAiAuthorizedContext,
    action: BotAiCommandAction,
    payload: BotAiCommandParams["payload"],
    channel: BotAiCommandExecutionInput["channel"],
  ): Promise<BotAiCommandResult> {
    const caps = getBotChannelCapabilities(channel);
    if (action === "list") {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const options = await deps.listThoughtLevelOptions(auth);
      if (options.length === 0) {
        return failure(deps.messages.thoughtLevelMissing(auth));
      }
      const currentValue = await deps.readCurrentThoughtLevelLabel(auth);
      return finalizeSelection("select_thought_level", options, caps, "请选择思考级别", currentValue);
    }
    if (action === "set" && payload?.thoughtLevel) {
      const running = await guardSelectionCommand(auth);
      if (running) return running;
      const applied = await deps.applyThoughtLevel(auth, payload.thoughtLevel);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done" };
    }
    return failure(deps.messages.thoughtLevelMissing(auth));
  }

  async function executeReply(
    auth: BotAiAuthorizedContext,
    action: BotAiCommandAction,
    payload: BotAiCommandParams["payload"],
    channel: BotAiCommandExecutionInput["channel"],
  ): Promise<BotAiCommandResult> {
    const caps = getBotChannelCapabilities(channel);
    if (action === "list") {
      const options = await deps.listReplyOptions(auth);
      const currentValue = await deps.readCurrentReplyLabel(auth);
      return finalizeSelection("select_reply", options, caps, "请选择回复详细度", currentValue);
    }
    if (action === "set" && payload?.replyMode) {
      const applied = await deps.applyReplyMode(auth, payload.replyMode);
      if (!applied.ok) {
        return failure(applied.error);
      }
      return { success: true, step: "done" };
    }
    return failure(deps.messages.replyMissing(auth));
  }

  return async function executeBotCommand(
    input: BotAiCommandExecutionInput,
  ): Promise<BotAiCommandResult> {
    const { command, action, payload } = input;
    if (!isBotAiCommandSupported(command, input.channel)) {
      return failure(getBotAiCommandUnsupportedReason(command));
    }
    const resolution = await deps.resolveAuthorizedContext(input.botId, command);
    if (!resolution.ok) {
      return failure(resolution.error);
    }
    const auth = resolution.auth;
    switch (command) {
      case "model":
        return executeModel(auth, action, payload, input.channel);
      case "workspace":
        return executeWorkspace(auth, action, payload, input.channel);
      case "task":
        return executeTask(auth, action, payload, input.channel);
      case "status":
        return { success: true, step: "done", message: await deps.getStatusSummary(auth) };
      case "reconnect": {
        const result = await deps.reconnectRemoteWorkspace(auth);
        if (!result.ok) {
          return failure(result.message ?? "重连失败");
        }
        return { success: true, step: "done", message: result.statusText };
      }
      case "new":
        return executeTask(auth, "execute", payload, input.channel);
      case "stop":
        return executeStop(auth);
      case "thoughtLevel":
        return executeThoughtLevel(auth, action, payload, input.channel);
      case "reply":
        return executeReply(auth, action, payload, input.channel);
      case "mode":
        return failure(getBotAiCommandUnsupportedReason("mode"));
    }
  };

  async function executeStop(auth: BotAiAuthorizedContext): Promise<BotAiCommandResult> {
    if (!auth.context.activeTaskId) {
      return failure(deps.messages.noActiveTask(auth));
    }
    const applied = await deps.stopActiveTask(auth);
    if (!applied.ok) {
      return failure(applied.error);
    }
    return { success: true, step: "done" };
  }
}
