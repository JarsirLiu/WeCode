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
  ListSessionsOutputSchema,
} from "@zcode/contracts";
import { workspaceListToolEntry } from "../src/tool/handlers/workspace-list.js";
import { listSessionsToolEntry } from "../src/tool/handlers/list-sessions.js";
import type { ToolExecutionContext } from "../src/tool/types.js";
import {
  buildBuiltInToolRegistrationPlan,
  createToolRegistry,
  registerBuiltInTools,
} from "../src/runtime/deps.js";

test("WorkspaceList 和 ListSessions 随 includeZCodeTask 注册", () => {
  const withGate = createToolRegistry();
  registerBuiltInTools(withGate, { includeZCodeTask: true, includeWorkspaceIndex: true });
  
  assert.equal(withGate.has(WORKSPACE_LIST_TOOL_NAME), true, "WorkspaceList 应在 includeZCodeTask: true 时注册");
  assert.equal(withGate.has(LIST_SESSIONS_TOOL_NAME), true, "ListSessions 应在 includeZCodeTask: true 时注册");

  const workspaceOnly = createToolRegistry();
  registerBuiltInTools(workspaceOnly, { includeWorkspaceIndex: true });
  assert.equal(workspaceOnly.has(WORKSPACE_LIST_TOOL_NAME), true);
  assert.equal(workspaceOnly.has(LIST_SESSIONS_TOOL_NAME), false);
  
  const withoutGate = createToolRegistry();
  registerBuiltInTools(withoutGate, {});
  
  assert.equal(withoutGate.has(WORKSPACE_LIST_TOOL_NAME), false, "WorkspaceList 不应在缺端口时注册");
  assert.equal(withoutGate.has(LIST_SESSIONS_TOOL_NAME), false, "ListSessions 不应在缺端口时注册");
});

test("注册计划包含新工具", () => {
  const options = { includeZCodeTask: true };
  const planned = buildBuiltInToolRegistrationPlan({ ...options, includeWorkspaceIndex: true }).map((entry) => entry.metadata.name);
  
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

test("WorkspaceList 读取 Host 索引并保留本地路径身份，不读取 task 列表", async () => {
  const calls: unknown[] = [];
  const context = {
    toolCallId: "tool_1",
    sessionId: "caller_session",
    traceId: "trace_1",
    traceContext: { traceId: "trace_1" },
    abortSignal: new AbortController().signal,
    workspaceIndexPort: {
      listWorkspaces: async (request: unknown) => {
        calls.push(request);
        return [
          { kind: "local", workspacePath: "D:/work/demo", label: "demo" },
          {
            kind: "remote",
            workspacePath: "/srv/app",
            workspaceIdentity: "ssh:host:/srv/app",
            label: "app",
            lastConnectionStatus: "connected" as const,
          },
        ];
      },
    },
  } as unknown as ToolExecutionContext;

  const result = await workspaceListToolEntry.handler({}, context);
  assert.deepEqual(result, {
    workspaces: [
      {
        kind: "local",
        workspacePath: "D:/work/demo",
        workspaceIdentity: "D:/work/demo",
        label: "demo",
      },
      {
        kind: "remote",
        workspacePath: "/srv/app",
        workspaceIdentity: "ssh:host:/srv/app",
        label: "app",
        lastConnectionStatus: "connected",
      },
    ],
  });
  assert.deepEqual(calls, [
    {
      sessionId: "caller_session",
      traceContext: { traceId: "trace_1" },
      signal: context.abortSignal,
    },
  ]);
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

test("ListSessions projects ZCodeSessionInfo into its stable tool summary", async () => {
  const context = {
    toolCallId: "list_1",
    sessionId: "caller_session",
    traceId: "trace_1",
    abortSignal: new AbortController().signal,
    zcodeSessionPort: {
      listSessions: async () => [
        {
          sessionId: "sess_1",
          workspace: {
            workspacePath: "D:/work/demo",
            workspaceIdentity: "D:/work/demo",
            workspaceKey: "D:/work/demo",
          },
          sessionKind: "interactive",
          title: "Demo",
          mode: "build",
          status: "completed",
          createdAt: 10,
          updatedAt: 20,
        },
      ],
    },
  } as never;

  const output = await listSessionsToolEntry.handler({ workspaceIdentity: "D:/work/demo" }, context);
  assert.deepEqual(output, {
    sessions: [
      {
        sessionId: "sess_1",
        workspacePath: "D:/work/demo",
        title: "Demo",
        status: "completed",
        mode: "build",
        createdAt: 10,
        updatedAt: 20,
      },
    ],
  });
  assert.equal(ListSessionsOutputSchema.safeParse(output).success, true);
});
