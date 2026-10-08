// ============================================================
// AI Session Orchestration 端口接线测试
// ============================================================
//
// 端口从 deps 到 handler 要经过多层手工拷贝（runtime-tools 注册门 → executor deps →
// call-runner context → handler），每层都是可选字段，漏抄不会有编译错误，只在运行时
// 表现为「工具不可用」。本测试用 stub 端口走完整 executor 链路，把这类断线变成红灯。
// 背景：CreateSession 曾因 create-app / agent-runtime / runtime-tools / impl 四处
// 装配断点在所有 Host 会话不可见或永远执行失败（spec: docs/specs/ai-session-orchestration.md）。

import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPACT_SESSION_TOOL_NAME,
  CREATE_SESSION_TOOL_NAME,
  READ_SESSION_TOOL_NAME,
  SEND_SESSION_MESSAGE_TOOL_NAME,
  SET_SESSION_MODEL_TOOL_NAME,
  STOP_SESSION_GENERATION_TOOL_NAME,
  type ZCodeSessionPort,
  type ZCodeTaskPort,
  LOAD_TOOL_SET_TOOL_NAME,
} from "@zcode/contracts";
import {
  buildBuiltInToolRegistrationPlan,
  createToolExecutor,
  createToolRegistry,
  registerBuiltInTools,
} from "../src/runtime/deps.js";
import { PermissionService } from "../src/permission/service.js";

const ZCODE_TASK_TOOL_NAMES = [
  CREATE_SESSION_TOOL_NAME,
  SEND_SESSION_MESSAGE_TOOL_NAME,
  READ_SESSION_TOOL_NAME,
  STOP_SESSION_GENERATION_TOOL_NAME,
  SET_SESSION_MODEL_TOOL_NAME,
  COMPACT_SESSION_TOOL_NAME,
] as const;

const STUB_TASK_META = {
  taskId: "task_stub",
  traceId: "trace_stub",
  title: "stub session",
  workspacePath: "/tmp/zcode-wiring-test",
  createdAt: 0,
  updatedAt: 0,
  mode: "build" as const,
  provider: "glm" as const,
  status: "running" as const,
};

function createRecordingTaskPort(): { port: ZCodeTaskPort; calls: { method: string; params: unknown }[] } {
  const calls: { method: string; params: unknown }[] = [];
  const unexpected = (method: string) => async () => {
    throw new Error(`unexpected ZCodeTaskPort call: ${method}`);
  };
  const port: ZCodeTaskPort = {
    createTask: async (params) => {
      calls.push({ method: "createTask", params });
      return { ...STUB_TASK_META, workspacePath: params.workspacePath };
    },
    sendPrompt: async (params) => {
      calls.push({ method: "sendPrompt", params });
      return {
        messageId: params.messageId ?? "message_stub",
        turnId: params.messageId ?? "turn_stub",
        acceptedAt: 0,
        deduplicated: false,
      };
    },
    stopGeneration: unexpected("stopGeneration"),
    compactSession: unexpected("compactSession"),
    resumeTask: unexpected("resumeTask"),
    listTasks: unexpected("listTasks"),
    getTaskSnapshot: unexpected("getTaskSnapshot"),
    setModel: unexpected("setModel"),
  };
  return { port, calls };
}

test("AI Session Orchestration 工具随 includeZCodeTask 开关注册", () => {
  const withGate = createToolRegistry();
  registerBuiltInTools(withGate, { includeZCodeTask: true });
  for (const name of ZCODE_TASK_TOOL_NAMES) {
    assert.equal(withGate.has(name), true, `${name} 应在 includeZCodeTask: true 时注册`);
  }

  const withoutGate = createToolRegistry();
  registerBuiltInTools(withoutGate, {});
  for (const name of ZCODE_TASK_TOOL_NAMES) {
    assert.equal(withoutGate.has(name), false, `${name} 不应在缺端口时注册`);
  }
});

test("内置工具注册从同一 plan 生成，注册结果不漂移", () => {
  const options = { includeZCodeTask: true, includeBotCommand: true };
  const planned = buildBuiltInToolRegistrationPlan(options).map((entry) => entry.metadata.name);
  const registry = createToolRegistry();
  registerBuiltInTools(registry, options);

  assert.deepEqual(registry.list(), planned);
  for (const name of ZCODE_TASK_TOOL_NAMES) {
    assert.equal(planned.includes(name), true, `${name} 应由 registration plan 暴露`);
  }
});

test("运行时默认工具面只暴露核心工具和 LoadToolSet", () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry, {
    deferOptionalToolSets: true,
    includeZCodeTask: true,
    includeWorkspaceIndex: true,
  });

  assert.deepEqual(registry.list(), [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "TodoRead",
    "TodoWrite",
    "TaskOutput",
    "TaskStop",
    "LoadToolSet",
    "ToolSearch",
  ]);
  assert.equal(registry.has("CreateSession"), false);
  assert.equal(registry.has("CronCreate"), false);
});

test("ToolSearch exposes exact toolset IDs from the LoadToolSet catalog", async () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { deferOptionalToolSets: true });
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_tool_search",
    getMode: () => "yolo",
  });
  const result = await executor.execute({ id: "search_1", name: "ToolSearch", input: { query: "orchestration" } });
  assert.equal(result.success, true, `搜索失败：${JSON.stringify(result.error ?? {})}`);
  assert.deepEqual((result.output as { results: Array<{ id: string }> }).results.map((entry) => entry.id), ["session"]);
});

test("LoadToolSet 执行后才把可选工具注册进当前会话", async () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { deferOptionalToolSets: true });
  let invalidated = 0;
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_dynamic_tools",
    getMode: () => "yolo",
    toolSetLoaderPort: {
      isToolRegistered: (name) => registry.has(name),
      registerTool: (entry) => registry.register(entry as never),
      registerTools: (entries) => entries.forEach((entry) => registry.register(entry as never)),
      invalidateToolCache: () => {
        invalidated += 1;
      },
    },
  });

  assert.equal(registry.has("CronCreate"), false);
  const result = await executor.execute({
    id: "call_dynamic_tools",
    name: LOAD_TOOL_SET_TOOL_NAME,
    input: { toolset_id: "automation" },
  });

  assert.equal(result.success, true, `动态加载失败：${JSON.stringify(result.error ?? {})}`);
  assert.equal(registry.has("CronCreate"), true);
  assert.equal(invalidated, 1);
});

test("CreateSession 执行把 zcodeTaskPort 送达 handler 并命中 stub", async () => {
  const { port, calls } = createRecordingTaskPort();
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });

  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_wiring_test",
    getMode: () => "yolo",
    zcodeTaskPort: port,
  });

  const result = await executor.execute({
    id: "call_wiring_1",
    name: CREATE_SESSION_TOOL_NAME,
    input: { workspacePath: "/tmp/zcode-wiring-test", mode: "build" },
  });

  assert.equal(result.success, true, `执行应成功：${JSON.stringify(result.error ?? {})}`);
  assert.equal(calls.length, 1, "stub port 的 createTask 应被命中一次");
  assert.equal(calls[0]?.method, "createTask");
  assert.equal((calls[0]?.params as { v4Create?: boolean }).v4Create, true);
  assert.equal(
    JSON.stringify(result.output).includes("task_stub"),
    true,
    "handler 输出应透传 stub 返回的 task meta",
  );
});

test("CreateSession 的 initialPrompt 在 V4 创建后经 sendPrompt 投递", async () => {
  const { port, calls } = createRecordingTaskPort();
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_wiring_test",
    getMode: () => "yolo",
    zcodeTaskPort: port,
  });

  const result = await executor.execute({
    id: "call_wiring_create_initial",
    name: CREATE_SESSION_TOOL_NAME,
    input: {
      workspacePath: "/tmp/zcode-wiring-test",
      initialPrompt: "implement the requested change",
    },
  });

  assert.equal(result.success, true, `执行应成功：${JSON.stringify(result.error ?? {})}`);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["createTask", "sendPrompt"],
  );
  assert.equal((calls[0]?.params as { v4Create?: boolean }).v4Create, true);
  assert.deepEqual(
    calls[1]?.params && {
      taskId: (calls[1].params as { taskId: string }).taskId,
      traceId: (calls[1].params as { traceId: string }).traceId,
      content: (calls[1].params as { content: string }).content,
    },
    {
      taskId: STUB_TASK_META.taskId,
      traceId: STUB_TASK_META.traceId,
      content: "implement the requested change",
    },
  );
});

test("ReadSession 执行把 zcodeSessionPort 送达 handler 并命中 stub", async () => {
  const calls: unknown[] = [];
  const sessionPort: ZCodeSessionPort = {
    listSessions: async () => [],
    readSession: async (params) => {
      calls.push(params);
      return { session: { sessionId: params.targetSessionId } } as never;
    },
  };
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });

  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_wiring_test",
    getMode: () => "yolo",
    zcodeSessionPort: sessionPort,
  });
  const result = await executor.execute({
    id: "call_wiring_read",
    name: READ_SESSION_TOOL_NAME,
    input: { sessionId: "target_session" },
  });

  assert.equal(result.success, true, `执行应成功：${JSON.stringify(result.error ?? {})}`);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0]).includes("target_session"), true);
});

test("ReadSession 只返回摘要，不泄露工具 input/output", async () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_summary_test",
    getMode: () => "yolo",
    zcodeSessionPort: {
      listSessions: async () => [],
      readSession: async () =>
        ({
          session: { sessionId: "target_session", title: "Summary test" },
          projection: {
            status: "completed",
            turnCount: 1,
            totalTokenCount: 42,
            contextUsed: 10,
            contextWindow: 100,
            pendingPermissions: [],
          },
          messages: [
            {
              info: { role: "assistant", time: { created: 1 } },
              parts: [
                {
                  type: "tool",
                  tool: "ReadFile",
                  callId: "call_1",
                  state: {
                    status: "completed",
                    input: { secret: "must-not-leak" },
                    output: "full output must not leak",
                    startedAt: 1,
                    completedAt: 2,
                  },
                },
              ],
            },
          ],
        }) as never,
    },
  });

  const result = await executor.execute({
    id: "call_summary_read",
    name: READ_SESSION_TOOL_NAME,
    input: { sessionId: "target_session" },
  });

  assert.equal(result.success, true, `执行应成功：${JSON.stringify(result.error ?? {})}`);
  const serialized = JSON.stringify(result.output);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("full output must not leak"), false);
  assert.equal(serialized.includes('"toolName":"ReadFile"'), true);
  assert.equal(serialized.includes('"status":"completed"'), true);
});

test("SendSessionMessage 返回 host admission 并把 messageId 送达端口", async () => {
  const { port, calls } = createRecordingTaskPort();
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_wiring_test",
    getMode: () => "yolo",
    zcodeTaskPort: port,
  });

  const result = await executor.execute({
    id: "call_wiring_send",
    name: SEND_SESSION_MESSAGE_TOOL_NAME,
    input: {
      taskId: "task_stub",
      content: "continue the task",
      traceId: "trace_wiring_send",
      messageId: "message_wiring_send",
    },
  });

  assert.equal(result.success, true, `执行应成功：${JSON.stringify(result.error ?? {})}`);
  assert.deepEqual(result.output, {
    messageId: "message_wiring_send",
    turnId: "message_wiring_send",
    acceptedAt: 0,
    deduplicated: false,
  });
  assert.equal(calls.at(-1)?.method, "sendPrompt");
  assert.equal(JSON.stringify(calls.at(-1)?.params).includes("message_wiring_send"), true);
});

test("executor 缺 zcodeTaskPort 时 CreateSession 返回结构化失败而非崩溃", async () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry, { includeZCodeTask: true });

  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    emitEvent: async () => {},
    sessionId: "sess_wiring_test",
    getMode: () => "yolo",
  });

  const result = await executor.execute({
    id: "call_wiring_2",
    name: CREATE_SESSION_TOOL_NAME,
    input: { workspacePath: "/tmp/zcode-wiring-test" },
  });

  assert.equal(result.success, false);
  assert.match(result.error?.message ?? "", /ZCode Task service is not available/);
});
