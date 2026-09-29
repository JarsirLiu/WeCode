import type { ModelSelection, ZCodeSessionStateSnapshot } from "@zcode/shared";
import type { CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";
import {
  assertV4CommandAckOk,
  createHostCommandEnvelope,
  sendHostCasCommandV4,
} from "./zcodeV4HostCommand.js";
import type { IZCodeAgentService } from "./zcodeAgent.js";

export interface ZCodeTaskV4MutationTarget {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

async function sendModelConfigCommand(
  agentService: IZCodeAgentService,
  target: ZCodeTaskV4MutationTarget,
  modelSelection: ModelSelection,
  traceId: string,
): Promise<void> {
  await sendHostCasCommandV4({
    send: (envelope) =>
      agentService.sendConversationCommandV4({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        envelope,
      }),
    type: "switchModelConfig",
    payload: {
      provider: modelSelection.providerId,
      model: modelSelection.modelId,
      thought: modelSelection.options?.reasoningLevel ?? "",
    },
    sessionId: target.taskId,
    contextMessage: `session=${target.taskId} model=${modelSelection.providerId}/${modelSelection.modelId}`,
    commandId: traceId,
  });
}

export async function setTaskModelV4(input: {
  agentService: IZCodeAgentService;
  target: ZCodeTaskV4MutationTarget;
  modelSelection: ModelSelection;
  traceId: string;
}): Promise<ZCodeSessionStateSnapshot> {
  await sendModelConfigCommand(
    input.agentService,
    input.target,
    input.modelSelection,
    input.traceId,
  );
  return input.agentService.readSession({
    workspacePath: input.target.workspacePath,
    workspaceIdentity: input.target.workspaceIdentity,
    sessionId: input.target.taskId,
  });
}

export async function compactTaskV4(input: {
  agentService: IZCodeAgentService;
  target: ZCodeTaskV4MutationTarget;
  inputId?: string;
  instructions?: string;
  expectedRevision?: number;
}): Promise<{ snapshot: ZCodeSessionStateSnapshot; inputId?: string }> {
  // V4 compact 没有旧协议的 instructions/stateRevision 字段，显式拒绝防止静默丢意图。
  if (input.instructions?.trim() || input.expectedRevision !== undefined) {
    throw new Error("CompactSession 已迁移到 V4 compact，不支持 instructions 或 expectedRevision");
  }
  const ack = await input.agentService.sendConversationCommandV4({
    workspacePath: input.target.workspacePath,
    workspaceIdentity: input.target.workspaceIdentity,
    envelope: createHostCommandEnvelope({
      type: "compact",
      payload: {} as CommandPayloadMap["compact"],
      sessionId: input.target.taskId,
      ...(input.inputId ? { commandId: input.inputId } : {}),
    }),
  });
  assertV4CommandAckOk("compact", ack, `session=${input.target.taskId}`);
  const snapshot = await input.agentService.readSession({
    workspacePath: input.target.workspacePath,
    workspaceIdentity: input.target.workspaceIdentity,
    sessionId: input.target.taskId,
  });
  return { snapshot, ...(input.inputId ? { inputId: input.inputId } : {}) };
}
