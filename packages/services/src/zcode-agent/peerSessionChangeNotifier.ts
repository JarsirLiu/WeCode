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
  change: "message" | "permission_requested" | "status";
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
        change: input.change,
        sequence: input.sequence,
      }),
    );
  } finally {
    repo.close();
  }
}
