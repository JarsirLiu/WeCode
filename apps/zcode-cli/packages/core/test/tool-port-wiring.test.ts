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
    sendPrompt: unexpected("sendPrompt"),
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
  assert.equal(
    JSON.stringify(result.output).includes("task_stub"),
    true,
    "handler 输出应透传 stub 返回的 task meta",
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
