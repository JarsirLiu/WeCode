import assert from "node:assert/strict";
import test from "node:test";
import { resolveTaskTargetFromHost } from "../src/zcode-agent/taskTargetResolver.js";

test("task target resolution uses the indexed workspace when the session is not cached", async () => {
  const meta = {
    taskId: "session-1",
    workspacePath: "D:\\work\\project",
    workspaceIdentity: "remote:ssh:host:22:user:/work/project",
  };
  const remembered: unknown[] = [];
  let query: Record<string, unknown> | undefined;
  const repo = {
    listTaskMetas: async (params: Record<string, unknown>) => {
      query = params;
      return [meta];
    },
  };
  const result = await resolveTaskTargetFromHost(
    "session-1",
    new Map(),
    repo as never,
    (entry) => remembered.push(entry),
  );
  assert.deepEqual(result, meta);
  assert.deepEqual(query, { taskId: "session-1" });
  assert.deepEqual(remembered, [meta]);
});

test("task target resolution rejects a session absent from both Host registries", async () => {
  await assert.rejects(
    resolveTaskTargetFromHost("missing", new Map(), { listTaskMetas: async () => [] } as never, () => undefined),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "ZCODE_SESSION_TARGET_NOT_FOUND",
  );
});
