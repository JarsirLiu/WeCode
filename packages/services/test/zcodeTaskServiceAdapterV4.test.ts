import assert from "node:assert/strict";
import test from "node:test";
import {
  ZCODE_PROTOCOL_NAME,
  ZCODE_PROTOCOL_VERSION,
  zcodeSessionStateSnapshotSchema,
  type ZCodeSessionStateSnapshot,
} from "@zcode/shared";
import { createZCodeTaskServiceAdapter } from "../src/zcode-agent/zcodeTaskServiceAdapter.js";

const target = {
  taskId: "task-v4-tool",
  workspacePath: "D:/workspace/v4-tool",
  traceId: "trace-v4-tool",
};

const snapshot = zcodeSessionStateSnapshotSchema.parse({
  protocol: { name: ZCODE_PROTOCOL_NAME, version: ZCODE_PROTOCOL_VERSION },
  session: {
    sessionId: target.taskId,
    workspace: { workspacePath: target.workspacePath, workspaceKey: target.workspacePath },
    sessionKind: "interactive",
    title: "V4 tool session",
    mode: "build",
    status: "running",
    createdAt: 1,
    updatedAt: 2,
  },
  settings: {
    model: {
      available: [],
      current: { providerId: "zcode", modelId: "glm-5" },
    },
    thoughtLevel: { enabled: false, available: [], current: "medium" },
    mode: { current: "build" },
  },
  projection: {
    sessionId: target.taskId,
    status: "running",
    mode: "build",
    turnCount: 1,
    totalTokenCount: 0,
    contextUsed: 0,
    contextWindow: 200000,
    pendingPermissions: [],
    activeToolCalls: [],
    backgroundJobs: [],
  },
  runtime: { eventSeq: 4, stateRevision: 3, pendingRequestIds: [] },
  messages: [],
  slashCommands: [{ name: "compact", description: "Compact" }],
});

function createService() {
  const commands: unknown[] = [];
  const readSessionCalls: unknown[] = [];
  type Options = Parameters<typeof createZCodeTaskServiceAdapter>[0];
  const service = createZCodeTaskServiceAdapter({
    zcodeAgentService: {
      async sendConversationCommandV4(input: unknown) {
        commands.push(input);
        const envelope = (input as { envelope: { commandId: string } }).envelope;
        return { commandId: envelope.commandId, status: "accepted", revisionAtDecision: 4 };
      },
      async readSession(input: unknown) {
        readSessionCalls.push(input);
        return snapshot;
      },
      onDynamicSessionEvent() {
        return () => {};
      },
      disposeAll() {},
    } as unknown as Options["zcodeAgentService"],
    taskIndexRepo: {
      async syncTaskMeta(input: { meta: unknown }) {
        return input.meta;
      },
      close() {},
    } as unknown as Options["taskIndexRepo"],
    taskIndexSyncer: {
      ensureSessionSubscription() {},
      emitWorkspaceTaskListChanged() {},
      onSessionTerminalEvent: () => ({ dispose() {} }),
      onSessionReadyEvent: () => ({ dispose() {} }),
      disposeAll() {},
    } as unknown as Options["taskIndexSyncer"],
  });
  // onDynamicTaskEvent is the adapter's public target-registration boundary.
  service.onDynamicTaskEvent({
    taskId: target.taskId,
    workspacePath: target.workspacePath,
    deliveryKind: "continuous",
  })(() => {});
  return { service, commands, readSessionCalls };
}

test("SetSessionModel uses V4 switchModelConfig and never legacy session/setModel", async () => {
  const { service, commands, readSessionCalls } = createService();
  try {
    await service.setModel({
      taskId: target.taskId,
      traceId: target.traceId,
      modelSelection: {
        providerId: "zcode",
        modelId: "glm-5",
        options: { reasoningLevel: "high" },
      },
    });
    const envelope = (
      commands[0] as { envelope: { type: string; commandId: string; payload: unknown } }
    ).envelope;
    assert.equal(envelope.type, "switchModelConfig");
    assert.equal(envelope.commandId, target.traceId);
    assert.deepEqual(envelope.payload, {
      provider: "zcode",
      model: "glm-5",
      thought: "high",
    });
    assert.equal(readSessionCalls.length, 1);
  } finally {
    service.disposeAll();
  }
});

test("CompactSession uses V4 compact and rejects legacy-only parameters", async () => {
  const { service, commands, readSessionCalls } = createService();
  try {
    const result = await service.compactSession({
      taskId: target.taskId,
      inputId: "compact-input-1",
    });
    const envelope = (
      commands[0] as { envelope: { type: string; commandId: string; payload: unknown } }
    ).envelope;
    assert.equal(envelope.type, "compact");
    assert.equal(envelope.commandId, "compact-input-1");
    assert.deepEqual(envelope.payload, {});
    assert.equal(readSessionCalls.length, 1);
    assert.equal(result.compact?.state, "accepted");

    await assert.rejects(
      service.compactSession({
        taskId: target.taskId,
        instructions: "keep the latest files",
      }),
      /不支持 instructions 或 expectedRevision/,
    );
  } finally {
    service.disposeAll();
  }
});

void (snapshot satisfies ZCodeSessionStateSnapshot);
