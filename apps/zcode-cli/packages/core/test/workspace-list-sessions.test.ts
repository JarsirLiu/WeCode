// ============================================================
// WorkspaceList & ListSessions 工具注册测试
// ============================================================

import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_LIST_TOOL_NAME,
  LIST_SESSIONS_TOOL_NAME,
  WorkspaceListInputSchema,
  ListSessionsInputSchema,
} from "@zcode/contracts";
import {
  buildBuiltInToolRegistrationPlan,
  createToolRegistry,
  registerBuiltInTools,
} from "../src/runtime/deps.js";

test("WorkspaceList 和 ListSessions 随 includeZCodeTask 注册", () => {
  const withGate = createToolRegistry();
  registerBuiltInTools(withGate, { includeZCodeTask: true });
  
  assert.equal(withGate.has(WORKSPACE_LIST_TOOL_NAME), true, "WorkspaceList 应在 includeZCodeTask: true 时注册");
  assert.equal(withGate.has(LIST_SESSIONS_TOOL_NAME), true, "ListSessions 应在 includeZCodeTask: true 时注册");
  
  const withoutGate = createToolRegistry();
  registerBuiltInTools(withoutGate, {});
  
  assert.equal(withoutGate.has(WORKSPACE_LIST_TOOL_NAME), false, "WorkspaceList 不应在缺端口时注册");
  assert.equal(withoutGate.has(LIST_SESSIONS_TOOL_NAME), false, "ListSessions 不应在缺端口时注册");
});

test("注册计划包含新工具", () => {
  const options = { includeZCodeTask: true };
  const planned = buildBuiltInToolRegistrationPlan(options).map((entry) => entry.metadata.name);
  
  assert.ok(planned.includes(WORKSPACE_LIST_TOOL_NAME), "WorkspaceList 应在注册计划中");
  assert.ok(planned.includes(LIST_SESSIONS_TOOL_NAME), "ListSessions 应在注册计划中");
});

test("WorkspaceList schema 验证", () => {
  const validInput = {};
  const result = WorkspaceListInputSchema.safeParse(validInput);
  assert.equal(result.success, true, "空输入应通过验证");
  
  const invalidInput = { foo: "bar" };
  const result2 = WorkspaceListInputSchema.safeParse(invalidInput);
  assert.equal(result2.success, false, "额外字段应被拒绝");
});

test("ListSessions schema 验证", () => {
  const validInput = { workspaceIdentity: "test-ws" };
  const result = ListSessionsInputSchema.safeParse(validInput);
  assert.equal(result.success, true, "有效输入应通过验证");
  assert.equal(result.data.workspaceIdentity, "test-ws");
  assert.equal(result.data.includeArchived, false);
  assert.equal(result.data.limit, 50);
  
  const invalidInput = { workspaceIdentity: "" };
  const result2 = ListSessionsInputSchema.safeParse(invalidInput);
  assert.equal(result2.success, false, "空 workspaceIdentity 应被拒绝");
});
