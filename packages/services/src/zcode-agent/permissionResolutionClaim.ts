import { PeerSessionRelationRepo } from "#src/session/peerSessionRelationRepo.js";

export async function runPermissionResolutionWithClaim(input: {
  workspacePath: string;
  workspaceIdentity?: string;
  targetSessionId: string;
  requestId: string;
  decision: string;
  resolverKind: "user" | "ai";
  resolverSessionId?: string;
  reason?: string;
  resolve: () => Promise<void>;
}): Promise<boolean> {
  const repo = new PeerSessionRelationRepo();
  const base = {
    workspacePath: input.workspacePath,
    ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
    targetSessionId: input.targetSessionId,
    requestId: input.requestId,
    resolverKind: input.resolverKind,
    ...(input.resolverSessionId ? { resolverSessionId: input.resolverSessionId } : {}),
    decision: input.decision,
    ...(input.reason ? { reason: input.reason } : {}),
  } as const;
  const claimed = await repo.claimPermissionResolution(base);
  if (!claimed) {
    await repo.completePermissionResolution({ ...base, outcome: "already_resolved" });
    repo.close();
    return false;
  }
  try {
    await input.resolve();
    await repo.completePermissionResolution({ ...base, outcome: "resolved" });
    return true;
  } catch (error) {
    await repo.completePermissionResolution({
      ...base,
      outcome: "runtime_failed",
      releaseClaim: true,
    });
    throw error;
  } finally {
    repo.close();
  }
}
