import {
  ZCODE_SESSION_CHANGED_NOTIFICATION,
  zcodeSessionChangedNotificationSchema,
} from "@zcode/shared";
import type { ZCodeProtocolClient } from "./zcodeProtocolClient.js";
import { PeerSessionRelationRepo } from "../session/peerSessionRelationRepo.js";

/** Wake-up hint only; ReadSession remains the authoritative state boundary. */
export async function notifyPeerSessionChanged(input: {
  client: Pick<ZCodeProtocolClient, "notify">;
  workspacePath: string;
  workspaceIdentity?: string;
  targetSessionId: string;
  sequence: number;
  kind:
    | "permission_requested"
    | "turn_completed"
    | "turn_failed"
    | "generation_stopped";
  turnId?: string;
  requestId?: string;
  summary?: string;
  error?: { code?: string; message: string };
}): Promise<void> {
  const repo = new PeerSessionRelationRepo();
  try {
    const relation = await repo.findCreatedSession({
      workspacePath: input.workspacePath,
      ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
      targetSessionId: input.targetSessionId,
    });
    if (!relation) return;
    await input.client.notify(
      ZCODE_SESSION_CHANGED_NOTIFICATION,
      zcodeSessionChangedNotificationSchema.parse({
        targetSessionId: input.targetSessionId,
        creatorSessionId: relation.creatorSessionId,
        sequence: input.sequence,
        kind: input.kind,
        ...(input.turnId ? { turnId: input.turnId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.summary ? { summary: input.summary.slice(0, 512) } : {}),
        ...(input.error
          ? {
              error: {
                ...(input.error.code ? { code: input.error.code } : {}),
                message: input.error.message.slice(0, 512),
              },
            }
          : {}),
      }),
    );
  } finally {
    repo.close();
  }
}
