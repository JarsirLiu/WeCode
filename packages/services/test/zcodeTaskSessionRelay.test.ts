import assert from "node:assert/strict";
import test from "node:test";
import { zcodeProtocolMethods, type ZCodeProtocolRequest } from "@zcode/shared";
import { handleTaskSessionReverseRequest } from "../src/zcode-agent/zcodeTaskSessionRelay.js";
import { createWorkspaceIndexServiceExecutor } from "../src/zcode-agent/workspaceIndexServiceExecutorFactory.js";
import { buildWorkspaceSummaries } from "../src/setting/workspaceIndex.js";

test("task relay 将 executor 异常作为 JSON-RPC error 返回", async () => {
  const responses: { result?: unknown; error?: { code: number; message: string } }[] = [];
  const request: ZCodeProtocolRequest = {
    id: "relay_error_1",
    method: zcodeProtocolMethods.taskSendPrompt,
    params: {
      requestId: "request_1",
      sessionId: "creator_1",
      workspaceKey: "workspace_1",
      workspacePath: "C:/workspace",
      taskId: "task_1",
      traceId: "trace_1",
      content: "hello",
    },
  };

  const handled = handleTaskSessionReverseRequest({
    request,
    client: {
      respond: async (_id, result) => {
        responses.push({ result });
      },
      respondError: async (_id, error) => {
        responses.push({ error });
      },
    },
    taskExecutor: {
      sendPrompt: async () => {
        throw new Error("FOREIGN KEY constraint failed");
      },
    } as never,
  });

  assert.equal(handled, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(responses, [
    { error: { code: -32603, message: "FOREIGN KEY constraint failed" } },
  ]);
});

test("workspace/list 经过 Host 设置索引返回本地与远程工作区", async () => {
  const responses: { result?: unknown; error?: unknown }[] = [];
  const settings = {
    lastWorkspaceSession: [
      { kind: "local" as const, workspacePath: "C:/repo/no-task" },
      {
        kind: "remote" as const,
        workspacePath: "/srv/repo",
        workspaceIdentity: "ssh:team:/srv/repo",
        target: { kind: "ssh" as const, host: "internal", user: "dev" },
        lastOpenedAt: 1,
        lastConnectionStatus: "connected" as const,
      },
    ],
    recentProjects: ["C:/repo/no-task", "C:/repo/recent"],
  };
  const workspaceIndexExecutor = createWorkspaceIndexServiceExecutor({
    readSettingService: () => ({
      listWorkspaces: async () => buildWorkspaceSummaries(settings),
    }) as never,
  });

  const handled = handleTaskSessionReverseRequest({
    request: {
      id: "workspace_list_1",
      method: zcodeProtocolMethods.workspaceList,
      params: {
        requestId: "request_1",
        sessionId: "caller_1",
        workspaceKey: "caller_workspace",
        workspacePath: "C:/caller",
      },
    },
    client: {
      respond: async (_id, result) => { responses.push({ result }); },
      respondError: async (_id, error) => { responses.push({ error }); },
    },
    taskExecutor: undefined,
    workspaceIndexExecutor,
  });

  assert.equal(handled, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(responses, [{
    result: [
      { kind: "local", workspacePath: "C:/repo/no-task", label: "no-task" },
      {
        kind: "remote",
        workspacePath: "/srv/repo",
        workspaceIdentity: "ssh:team:/srv/repo",
        label: "repo",
        lastConnectionStatus: "connected",
      },
      { kind: "local", workspacePath: "C:/repo/recent", label: "recent", workspacePurpose: "project" },
    ],
  }]);
});
