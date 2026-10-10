import assert from "node:assert/strict";
import test from "node:test";
import { createZCodeTaskServiceExecutor } from "../src/zcode-agent/zcodeTaskServiceExecutorFactory.js";

test("Host executor routes prompt and model changes through the resolved target workspace", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const taskService = {
    resolveTaskTarget: async () => ({
      taskId: "target-session",
      workspacePath: "D:/target-workspace",
      workspaceIdentity: "remote:ssh:target:/workspace",
      remoteSessionId: "remote-target-session",
    }),
    sendPrompt: async (input: Record<string, unknown>) => {
      calls.push({ method: "sendPrompt", ...input });
      return { taskId: "target-session", accepted: true };
    },
    setModel: async (input: Record<string, unknown>) => {
      calls.push({ method: "setModel", ...input });
      return [];
    },
  };
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () => taskService as never,
    readZCodeSessionService: () => undefined,
  });

  await executor.sendPrompt({
    callerSessionId: "target-session",
    workspaceKey: "caller-workspace",
    workspacePath: "D:/caller-workspace",
    taskId: "target-session",
    traceId: "trace-prompt" as never,
    content: "hello",
  });
  await executor.setModel({
    callerSessionId: "target-session",
    workspaceKey: "caller-workspace",
    workspacePath: "D:/caller-workspace",
    taskId: "target-session",
    traceId: "trace-model" as never,
    modelSelection: { providerId: "provider", modelId: "model" },
  });

  assert.deepEqual(
    calls.map(({ method, workspacePath, workspaceIdentity, remoteSessionId }) => ({
      method,
      workspacePath,
      workspaceIdentity,
      remoteSessionId,
    })),
    [
      {
        method: "sendPrompt",
        workspacePath: "D:/target-workspace",
        workspaceIdentity: "remote:ssh:target:/workspace",
        remoteSessionId: "remote-target-session",
      },
      {
        method: "setModel",
        workspacePath: "D:/target-workspace",
        workspaceIdentity: "remote:ssh:target:/workspace",
        remoteSessionId: "remote-target-session",
      },
    ],
  );
});

test("Host executor preserves the caller remote session for a self target recovered from the index", async () => {
  let received: Record<string, unknown> | undefined;
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () =>
      ({
        resolveTaskTarget: async () => ({
          taskId: "caller-session",
          workspacePath: "D:/caller-workspace",
        }),
        sendPrompt: async (input: Record<string, unknown>) => {
          received = input;
          return { taskId: "caller-session", accepted: true };
        },
      }) as never,
    readZCodeSessionService: () => undefined,
  });

  await executor.sendPrompt({
    callerSessionId: "caller-session",
    workspaceKey: "caller-workspace",
    workspacePath: "D:/caller-workspace",
    remoteSessionId: "remote-caller-session",
    taskId: "caller-session",
    traceId: "trace-self" as never,
    content: "hello",
  });

  assert.equal(received?.workspacePath, "D:/caller-workspace");
  assert.equal(received?.remoteSessionId, "remote-caller-session");
});

test("Host executor preserves structured target lookup failures", async () => {
  let serviceCalled = false;
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () =>
      ({
        resolveTaskTarget: async () => {
          throw Object.assign(new Error("ambiguous target"), {
            code: "ZCODE_SESSION_TARGET_AMBIGUOUS",
          });
        },
        sendPrompt: async () => {
          serviceCalled = true;
          return { taskId: "target-session", accepted: true };
        },
      }) as never,
    readZCodeSessionService: () => undefined,
  });

  await assert.rejects(
    executor.sendPrompt({
      callerSessionId: "caller-session",
      workspaceKey: "caller-workspace",
      workspacePath: "D:/caller-workspace",
      taskId: "target-session",
      traceId: "trace-ambiguous" as never,
      content: "hello",
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "ZCODE_SESSION_TARGET_AMBIGUOUS",
  );
  assert.equal(serviceCalled, false);
});

test("Host executor rejects a target without a creator relation", async () => {
  let serviceCalled = false;
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () =>
      ({
        resolveTaskTarget: async () => ({
          taskId: "target-session",
          workspacePath: "D:/target-workspace",
        }),
        sendPrompt: async () => {
          serviceCalled = true;
          return { taskId: "target-session", accepted: true };
        },
      }) as never,
    readZCodeSessionService: () => undefined,
    createPeerSessionRelationRepo: () =>
      ({
        findCreatedSession: async () => null,
        close: () => undefined,
      }) as never,
  });

  await assert.rejects(
    executor.sendPrompt({
      callerSessionId: "caller-session",
      workspaceKey: "caller-workspace",
      workspacePath: "D:/caller-workspace",
      taskId: "target-session",
      traceId: "trace-unauthorized" as never,
      content: "hello",
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "not_authorized",
  );
  assert.equal(serviceCalled, false);
});

test("Host executor lets the creator manage a created session", async () => {
  let received: Record<string, unknown> | undefined;
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () =>
      ({
        resolveTaskTarget: async () => ({
          taskId: "target-session",
          workspacePath: "D:/target-workspace",
          workspaceIdentity: "target-identity",
        }),
        sendPrompt: async (input: Record<string, unknown>) => {
          received = input;
          return { taskId: "target-session", accepted: true };
        },
      }) as never,
    readZCodeSessionService: () => undefined,
    createPeerSessionRelationRepo: () =>
      ({
        findCreatedSession: async () => ({
          creatorSessionId: "caller-session",
          targetSessionId: "target-session",
          workspaceKey: "caller-workspace",
          workspacePath: "D:/target-workspace",
          workspaceIdentity: "target-identity",
          createdBy: "ai",
          createdAt: 1,
        }),
        close: () => undefined,
      }) as never,
  });

  await executor.sendPrompt({
    callerSessionId: "caller-session",
    workspaceKey: "caller-workspace",
    workspacePath: "D:/caller-workspace",
    taskId: "target-session",
    traceId: "trace-manual" as never,
    content: "continue",
  });

  assert.equal(received?.taskId, "target-session");
  assert.equal(received?.workspacePath, "D:/target-workspace");
  assert.equal(received?.workspaceIdentity, "target-identity");
});

test("creator AI resolves an exact pending permission without a second policy", async () => {
  let response: Record<string, unknown> | undefined;
  const executor = createZCodeTaskServiceExecutor({
    readZCodeTaskService: () =>
      ({
        resolveTaskTarget: async () => ({
          taskId: "target-session",
          workspacePath: "D:/target-workspace",
          workspaceIdentity: "target-identity",
        }),
        respondPermission: async (input: Record<string, unknown>) => {
          response = input;
          return true;
        },
      }) as never,
    readZCodeSessionService: () =>
      ({
        readSession: async () => ({
          projection: {
            pendingPermissions: [
              {
                requestId: "request-1",
                options: [{ kind: "allowAlways", optionId: "allow-always-1" }],
              },
            ],
          },
        }),
      }) as never,
    createPeerSessionRelationRepo: () =>
      ({
        findCreatedSession: async () => ({
          creatorSessionId: "caller-session",
          targetSessionId: "target-session",
          workspaceKey: "target-identity",
          workspacePath: "D:/target-workspace",
          workspaceIdentity: "target-identity",
          createdBy: "ai",
          createdAt: 1,
        }),
        close: () => undefined,
      }) as never,
  });

  const result = await executor.resolveSessionPermission({
    workspaceKey: "target-identity",
    workspacePath: "D:/caller-workspace",
    creatorSessionId: "caller-session",
    targetSessionId: "target-session",
    requestId: "request-1",
    decision: "allow_always",
  });

  assert.deepEqual(result, {
    requestId: "request-1",
    status: "resolved",
    decision: "allow_always",
  });
  assert.equal(response?.optionId, "allow-always-1");
  assert.deepEqual(response?.resolution, {
    resolverKind: "ai",
    resolverSessionId: "caller-session",
  });
});
