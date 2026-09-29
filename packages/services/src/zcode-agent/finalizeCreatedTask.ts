import type { PeerSessionCreation, ZCodeSessionStateSnapshot, ZCodeTaskMeta } from "@zcode/shared";
import { persistPeerSessionCreation } from "#src/session/peerSessionRelationRepo.js";

/** 收敛 AI 创建后共同的 Host 副作用；task adapter 不持有审批关系账本。 */
export async function finalizeCreatedTask(input: {
  target: { workspacePath: string; workspaceIdentity?: string };
  snapshot: ZCodeSessionStateSnapshot;
  meta: ZCodeTaskMeta;
  relation?: PeerSessionCreation;
  emitWorkspaceConfig: (
    target: { workspacePath: string; workspaceIdentity?: string },
    settings: ZCodeSessionStateSnapshot["settings"],
  ) => void;
  emitWorkspaceTaskCreated: (
    target: { workspacePath: string; workspaceIdentity?: string },
    meta: ZCodeTaskMeta,
  ) => void;
}): Promise<void> {
  input.emitWorkspaceConfig(input.target, input.snapshot.settings);
  input.emitWorkspaceTaskCreated(input.target, input.meta);
  if (input.relation) {
    await persistPeerSessionCreation(input.relation, {
      targetSessionId: input.meta.taskId,
      ...input.meta,
    });
  }
}
