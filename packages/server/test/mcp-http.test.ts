import assert from "node:assert/strict";
import test from "node:test";
import { ServiceCollection } from "@zcode/services";
import { ISettingService } from "@zcode/services";
import { createMcpHttpHandler } from "../src/mcp/http.js";
import { DEFAULT_MCP_HTTP_PORT } from "../src/mcp/index.js";
import { createHostMcpToolHandler } from "../src/mcp/host-tool-handler.js";
import { IZCodeTaskService, IZCodeSessionService } from "@zcode/services";

function services(enabled: boolean): ServiceCollection {
  return new ServiceCollection().register(ISettingService, {
    get: async () => ({ mcpEnabled: enabled }),
    listWorkspaces: async () => [],
  } as never);
}

test("MCP public entrypoint exposes the stable desktop port contract", () => {
  assert.equal(DEFAULT_MCP_HTTP_PORT, 39173);
});

test("MCP HTTP rejects calls while disabled", async () => {
  const response = await createMcpHttpHandler({ services: services(false) })(
    new Request("http://localhost/mcp", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "WECODE_MCP_DISABLED");
});

test("MCP HTTP health probe is side-effect free and reports readiness", async () => {
  const response = await createMcpHttpHandler({ services: services(true) })(
    new Request("http://localhost/mcp", { method: "HEAD" }),
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("MCP HTTP health probe honors the runtime toggle", async () => {
  const response = await createMcpHttpHandler({ services: services(false) })(
    new Request("http://localhost/mcp", { method: "HEAD" }),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "WECODE_MCP_DISABLED");
});

test("MCP HTTP requires configured bearer token", async () => {
  const response = await createMcpHttpHandler({ services: services(true), authToken: "secret" })(
    new Request("http://localhost/mcp", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 401);
});

test("MCP HTTP completes initialize and tools/list with the real protocol transport", async () => {
  const handler = createMcpHttpHandler({
    services: services(true),
    toolHandler: async () => ({ ok: true }),
  });
  const request = (body: unknown) =>
    handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      }),
    );

  const initialized = await request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "wecode-test-harness", version: "1.0.0" },
    },
  });
  assert.equal(initialized.status, 200);
  const initializePayload = (await initialized.json()) as {
    result?: { capabilities?: { tools?: unknown } };
  };
  assert.ok(initializePayload.result?.capabilities?.tools);

  const listed = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(listed.status, 200);
  const listPayload = (await listed.json()) as { result?: { tools?: Array<{ name: string }> } };
  assert.deepEqual(listPayload.result?.tools?.map((tool) => tool.name).sort(), [
    "compact_session",
    "create_session",
    "list_sessions",
    "read_session",
    "resolve_session_permission",
    "send_session_message",
    "set_session_model",
    "stop_session_generation",
    "workspace_list",
  ]);
});

test("Host MCP handler dispatches workspace_list through the setting service", async () => {
  const expected = [{ kind: "local", workspacePath: "D:\\work", label: "work" }];
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => expected,
    } as never)
    .register(IZCodeTaskService, {} as never)
    .register(IZCodeSessionService, {} as never);
  const result = await createHostMcpToolHandler(collection)("workspace_list", {});
  assert.deepEqual(result, { workspaces: expected });
});

test("Host MCP handler reaches every registered service operation", async () => {
  const calls: string[] = [];
  const workspace = { kind: "local", workspacePath: "D:\\work", label: "work" };
  const mark = (name: string) => async () => {
    calls.push(name);
    return { name };
  };
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => [workspace],
    } as never)
    .register(IZCodeTaskService, {
      createTask: mark("createTask"),
      sendPrompt: mark("sendPrompt"),
      stopGeneration: mark("stopGeneration"),
      setModel: mark("setModel"),
      compactSession: mark("compactSession"),
      respondPermission: mark("respondPermission"),
      resolveTaskTarget: async () => ({ taskId: "s", workspacePath: workspace.workspacePath }),
    } as never)
    .register(IZCodeSessionService, {
      listSessions: mark("listSessions"),
      readSession: mark("readSession"),
    } as never);
  const handler = createHostMcpToolHandler(collection);
  const args = {
    workspacePath: workspace.workspacePath,
    sessionId: "s",
    message: "hello",
    traceId: "t",
    model: "provider/model",
    requestId: "r",
    decision: "allow_once",
  };
  await handler("workspace_list", {});
  await handler("list_sessions", { workspacePath: workspace.workspacePath });
  await handler("create_session", { workspacePath: workspace.workspacePath, message: "hello" });
  await handler("send_session_message", {
    sessionId: args.sessionId,
    message: args.message,
    traceId: args.traceId,
  });
  await handler("read_session", { sessionId: args.sessionId });
  await handler("stop_session_generation", { sessionId: args.sessionId });
  await handler("set_session_model", { sessionId: args.sessionId, model: args.model });
  await handler("compact_session", { sessionId: args.sessionId });
  await handler("resolve_session_permission", {
    sessionId: args.sessionId,
    requestId: args.requestId,
    decision: args.decision,
  });
  assert.deepEqual(calls, [
    "listSessions",
    "createTask",
    "sendPrompt",
    "sendPrompt",
    "readSession",
    "stopGeneration",
    "setModel",
    "compactSession",
    "respondPermission",
  ]);
});

test("Host MCP handler maps model and delegated permission inputs to Host contracts", async () => {
  const workspace = { kind: "local", workspacePath: "D:\\work", label: "work" };
  let modelSelection: unknown;
  let permission: unknown;
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => [workspace],
    } as never)
    .register(IZCodeTaskService, {
      resolveTaskTarget: async () => ({ taskId: "s", workspacePath: workspace.workspacePath }),
      setModel: async (input: { modelSelection: unknown }) => {
        modelSelection = input.modelSelection;
        return [];
      },
      respondPermission: async (input: unknown) => {
        permission = input;
        return true;
      },
    } as never)
    .register(IZCodeSessionService, {} as never);
  const handler = createHostMcpToolHandler(collection);
  await handler("set_session_model", { sessionId: "s", model: "provider/model" });
  assert.deepEqual(modelSelection, { providerId: "provider", modelId: "model" });
  await handler("resolve_session_permission", {
    sessionId: "s",
    requestId: "r",
    decision: "allow_once",
  });
  assert.equal((permission as { response: { decision: string } }).response.decision, "allow");
});

test("Host MCP handler resolves session workspace and submits create message", async () => {
  const workspace = { kind: "local", workspacePath: "D:\\work", label: "work" };
  const calls: string[] = [];
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => [workspace],
    } as never)
    .register(IZCodeTaskService, {
      createTask: async () => ({ taskId: "s", traceId: "session-trace" }),
      sendPrompt: async (input: { content: string }) => {
        calls.push(input.content);
        return { accepted: true };
      },
      resolveTaskTarget: async () => ({ taskId: "s", workspacePath: workspace.workspacePath }),
    } as never)
    .register(IZCodeSessionService, {
      readSession: async (input: { sessionId: string; workspacePath: string }) => ({
        sessionId: input.sessionId,
        workspacePath: input.workspacePath,
      }),
    } as never);
  const result = await createHostMcpToolHandler(collection)("create_session", {
    workspacePath: workspace.workspacePath,
    message: "你是谁？",
  });
  assert.equal((result as { taskId: string }).taskId, "s");
  assert.deepEqual(calls, ["你是谁？"]);
  const snapshot = await createHostMcpToolHandler(collection)("read_session", { sessionId: "s" });
  assert.deepEqual(snapshot, { sessionId: "s", workspacePath: workspace.workspacePath });
});

test("MCP validates its public input contract and forwards incremental read options", async () => {
  const workspace = { kind: "local", workspacePath: "D:\\work", label: "work" };
  let readInput: unknown;
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => [workspace],
    } as never)
    .register(IZCodeTaskService, {
      resolveTaskTarget: async () => ({ taskId: "s", workspacePath: workspace.workspacePath }),
    } as never)
    .register(IZCodeSessionService, {
      readSession: async (input: unknown) => {
        readInput = input;
        return { ok: true };
      },
    } as never);
  const handler = createHostMcpToolHandler(collection);

  await handler("read_session", { sessionId: "s", messageLimit: 12, afterSeq: 47 });
  assert.deepEqual(readInput, {
    sessionId: "s",
    workspacePath: workspace.workspacePath,
    messageLimit: 12,
    afterSeq: 47,
  });
  await assert.rejects(
    handler("send_session_message", { sessionId: "s", text: "undocumented alias" }),
    /WECODE_MCP_INVALID_ARGUMENTS/,
  );
});

test("Host MCP handler rejects a workspace outside the Host index", async () => {
  const collection = services(true)
    .register(ISettingService, {
      get: async () => ({ mcpEnabled: true }),
      listWorkspaces: async () => [],
    } as never)
    .register(IZCodeTaskService, { createTask: async () => ({}) } as never)
    .register(IZCodeSessionService, {} as never);
  await assert.rejects(
    createHostMcpToolHandler(collection)("create_session", {
      workspacePath: "D:\\private",
      message: "start",
    }),
    /WECODE_MCP_WORKSPACE_FORBIDDEN/,
  );
});
