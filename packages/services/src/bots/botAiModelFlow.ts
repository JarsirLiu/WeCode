import { completeNewModelSelection } from "@zcode/provider";
import {
  decodeCustomModelValue,
  generateTraceId,
  normalizeAgentProviderToZCodeAgent,
  type ZCodeProvider,
} from "@zcode/shared";
import { formatBotModelSelectionValue, parseBotModelOptionValue } from "./botConfigSelectHelpers.js";
import type { BotAiAuthorizedContext, BotAiCommandDeps } from "./botAiCommandPolicy.js";
import {
  msg,
  type AiTaskRef,
  type BotAiCommandBridgePrimitives,
} from "./botAiCommandBridgePrimitives.js";

async function resolveModelTarget(
  p: BotAiCommandBridgePrimitives,
  auth: BotAiAuthorizedContext,
): Promise<
  | { ok: true; task: AiTaskRef; provider: ZCodeProvider; taskId?: string }
  | { ok: false; error: string }
> {
  if (auth.context.mode === "draft" || !auth.context.activeTaskId) {
    const draftOptions = await p.resolveDraftOptionsForDisplay(auth.context);
    return {
      ok: true,
      task: {
        model: formatBotModelSelectionValue(draftOptions.modelSelection),
        workspacePath: auth.context.workspacePath,
        workspaceIdentity: auth.context.workspaceIdentity,
      },
      provider: draftOptions.provider,
    };
  }
  const task = await p.readContextActiveTaskMeta(auth.context);
  if (!task) {
    return { ok: false, error: msg(auth.locale, "noActiveTask") };
  }
  const activeProvider = normalizeAgentProviderToZCodeAgent(task.provider);
  if (!activeProvider) {
    return { ok: false, error: msg(auth.locale, "modelProviderMissing") };
  }
  return { ok: true, task, provider: activeProvider, taskId: auth.context.activeTaskId };
}

export function createBotAiModelFlowDeps(
  p: BotAiCommandBridgePrimitives,
): Pick<BotAiCommandDeps, "listModelProviderOptions" | "listModelOptionsForProvider" | "readCurrentModelLabel" | "applyModelSelection"> {
  return {
    async listModelProviderOptions(auth) {
      const target = await resolveModelTarget(p, auth);
      if (!target.ok) return [];
      return p.listModelProviderOptions(target.task, target.provider);
    },
    async listModelOptionsForProvider(auth, providerId) {
      const target = await resolveModelTarget(p, auth);
      if (!target.ok) return [];
      return p.listModelOptionsForProvider(target.task, target.provider, providerId);
    },
    async readCurrentModelLabel(auth) {
      if (auth.context.mode === "draft" || !auth.context.activeTaskId) {
        const draftOptions = await p.resolveDraftOptionsForDisplay(auth.context);
        return p.formatStatusModelLabel(
          formatBotModelSelectionValue(draftOptions.modelSelection),
          auth.context,
        );
      }
      const task = await p.readContextActiveTaskMeta(auth.context);
      if (!task) return undefined;
      const configOptions = await p.listActiveTaskConfigOptions(auth.context, task.taskId);
      return p.formatStatusModelLabel(
        p.readCurrentActiveTaskModel(task, configOptions),
        auth.context,
      );
    },
    async applyModelSelection(auth, modelId) {
      const target = await resolveModelTarget(p, auth);
      if (!target.ok) return { ok: false, error: target.error };
      const model = (await p.listAllModelOptions(target.task, target.provider)).find(
        (item) => item.id === modelId,
      );
      if (!model) {
        return { ok: false, error: msg(auth.locale, "modelMissing") };
      }
      if (!target.taskId) {
        const draftOptions = await p.ensureDraftOptions(auth.context);
        const identity = parseBotModelOptionValue(model.id);
        const view = await p.readModelSelectionView(auth.context);
        const selection = view && identity ? completeNewModelSelection(view, identity) : undefined;
        if (!selection) {
          return { ok: false, error: msg(auth.locale, "modelMissing") };
        }
        await p.writeDraftOptions(auth.context, {
          ...draftOptions,
          // 模型身份切换必须构造全新的 Selection，不能把旧模型的显式 options 带过去。
          modelSelection: selection,
        });
        return { ok: true };
      }
      const customModel = decodeCustomModelValue(model.id);
      const runtimeModelId = customModel
        ? p.resolveCustomModelRuntimeId(target.provider, customModel)
        : model.id;
      if (!runtimeModelId) {
        return { ok: false, error: msg(auth.locale, "modelMissing") };
      }
      const targetIdentity = customModel?.modelName
        ? {
            // bot /model 选择 custom provider 时 runtimeModelId 会降成纯模型名，
            // legacy task facade 必须额外拿到原始 provider 身份。
            providerId: customModel.providerId,
            modelId: customModel.modelName,
          }
        : { providerId: target.provider, modelId: runtimeModelId };
      const view = await p.readModelSelectionView(target.task);
      const targetModelSelection = view
        ? completeNewModelSelection(view, targetIdentity)
        : undefined;
      if (!targetModelSelection) {
        return { ok: false, error: msg(auth.locale, "modelMissing") };
      }
      const zcodeTaskService = await p.resolveZCodeTaskServiceForContext(auth.context);
      const configOptions = await zcodeTaskService.setModel({
        taskId: target.taskId,
        traceId: generateTraceId(target.taskId),
        modelSelection: targetModelSelection,
      });
      await p.broadcastTaskConfigSync({
        context: auth.context,
        taskId: target.taskId,
        task: await p.readContextActiveTaskMeta(auth.context),
        provider: target.provider,
        configOptions,
      });
      return { ok: true };
    },
  };
}
