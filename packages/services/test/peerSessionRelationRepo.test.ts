import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerSessionRelationRepo } from "../src/session/peerSessionRelationRepo.js";

test("peer session relation persists the first creator and policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-peer-session-relation-"));
  const path = join(directory, "tasks.sqlite");
  const repo = new PeerSessionRelationRepo(path);
  try {
    const relation = {
      creatorSessionId: "creator-a",
      targetSessionId: "target-a",
      workspacePath: "/workspace/a",
      workspaceIdentity: "ssh://example/workspace/a",
      remoteSessionId: "remote-a",
      approvalPolicy: "delegated" as const,
      createdAt: 123,
    };
    await repo.recordCreatedSession(relation);
    await repo.recordCreatedSession({
      ...relation,
      creatorSessionId: "creator-b",
      approvalPolicy: "manual",
      createdAt: 456,
    });

    assert.deepEqual(
      await repo.findCreatedSession({
        workspacePath: relation.workspacePath,
        workspaceIdentity: relation.workspaceIdentity,
        targetSessionId: relation.targetSessionId,
      }),
      {
        ...relation,
        workspaceKey: relation.workspaceIdentity,
        createdBy: "ai",
      },
    );
  } finally {
    repo.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("peer session relations stay isolated by workspace identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-peer-session-isolation-"));
  const path = join(directory, "tasks.sqlite");
  const repo = new PeerSessionRelationRepo(path);
  try {
    await repo.recordCreatedSession({
      creatorSessionId: "creator",
      targetSessionId: "same-target",
      workspacePath: "/same/path",
      workspaceIdentity: "ssh://host-a/same/path",
      approvalPolicy: "manual",
      createdAt: 1,
    });
    assert.equal(
      await repo.findCreatedSession({
        workspacePath: "/same/path",
        workspaceIdentity: "ssh://host-b/same/path",
        targetSessionId: "same-target",
      }),
      null,
    );
  } finally {
    repo.close();
    await rm(directory, { recursive: true, force: true });
  }
});
