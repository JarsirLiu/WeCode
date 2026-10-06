import assert from "node:assert/strict";
import test from "node:test";
import {
  createWeCodeMcpServer,
  WECODE_MCP_SERVER_VERSION,
  type WeCodeToolHandler,
} from "../src/mcp/index.js";
import { MCP_TOOLS } from "../src/mcp/tool-adapter.js";

test("mcp-server: createWeCodeMcpServer creates a valid server instance", () => {
  const mockHandler: WeCodeToolHandler = async () => ({
    ok: true,
  });

  const server = createWeCodeMcpServer(mockHandler);

  assert.ok(server, "Server should be created");
  assert.ok(server.setRequestHandler, "Server should have setRequestHandler method");
});

test("mcp-server: advertises the first public HTTP contract version", () => {
  assert.equal(WECODE_MCP_SERVER_VERSION, "0.1.0");
});

test("mcp-server: Server instance has required methods for MCP protocol", () => {
  const mockHandler: WeCodeToolHandler = async () => ({
    ok: true,
  });

  const server = createWeCodeMcpServer(mockHandler);
  
  assert.ok(typeof server.setRequestHandler === "function", "Should have setRequestHandler method");
  assert.ok(typeof server.connect === "function", "Should have connect method");
});

test("mcp-server: All MCP tools have required properties", () => {
  const requiredProperties = ["name", "description", "inputSchema"];

  for (const tool of MCP_TOOLS) {
    for (const prop of requiredProperties) {
      assert.ok(tool[prop as keyof typeof tool], `Tool "${tool.name}" should have "${prop}"`);
    }
  }
});

test("mcp-server: CreateSession tool has description mentioning workspace", () => {
  const createSessionTool = MCP_TOOLS.find(t => t.name === "create_session");
  assert.ok(createSessionTool, "CreateSession tool should exist");
  assert.ok(
    createSessionTool.description.toLowerCase().includes("workspace") ||
    createSessionTool.description.toLowerCase().includes("session"),
    "CreateSession description should mention workspace or session"
  );
});

test("mcp-server: SendSessionMessage tool has description mentioning message", () => {
  const sendMessageTool = MCP_TOOLS.find(t => t.name === "send_session_message");
  assert.ok(sendMessageTool, "SendSessionMessage tool should exist");
  assert.ok(
    sendMessageTool.description.toLowerCase().includes("message"),
    "SendSessionMessage description should mention message"
  );
});

test("mcp-server: ResolveSessionPermission tool has description", () => {
  const resolveTool = MCP_TOOLS.find(t => t.name === "resolve_session_permission");
  assert.ok(resolveTool, "ResolveSessionPermission tool should exist");
  assert.ok(resolveTool.description, "ResolveSessionPermission should have description");
});

test("mcp-server: All tools have inputSchema with type 'object'", () => {
  for (const tool of MCP_TOOLS) {
    assert.equal(
      tool.inputSchema.type,
      "object",
      `Tool "${tool.name}" inputSchema type should be "object"`
    );
  }
});

test("mcp-server: Tool names are unique", () => {
  const names = MCP_TOOLS.map(t => t.name);
  const uniqueNames = new Set(names);

  assert.equal(
    names.length,
    uniqueNames.size,
    "All tool names should be unique"
  );
});

test("mcp-server: No tool names are empty or whitespace", () => {
  for (const tool of MCP_TOOLS) {
    assert.ok(
      tool.name && tool.name.trim().length > 0,
      `Tool should have non-empty name`
    );
  }
});

test("mcp-server: Tool descriptions are not empty", () => {
  for (const tool of MCP_TOOLS) {
    assert.ok(
      tool.description && tool.description.trim().length > 0,
      `Tool "${tool.name}" should have non-empty description`
    );
  }
});

test("mcp-server: All 9 session orchestration tools are defined", () => {
  const expectedToolCount = 9;
  assert.equal(
    MCP_TOOLS.length,
    expectedToolCount,
    `Should have exactly ${expectedToolCount} tools`
  );

  const expectedNames = new Set([
    "create_session",
    "send_session_message",
    "read_session",
    "stop_session_generation",
    "set_session_model",
    "compact_session",
    "resolve_session_permission",
    "workspace_list",
    "list_sessions",
  ]);

  const actualNames = new Set(MCP_TOOLS.map(t => t.name));
  
  for (const name of expectedNames) {
    assert.ok(actualNames.has(name), `Tool "${name}" should be defined`);
  }
});

test("mcp-server: CreateSession tool has workspacePath in properties", () => {
  const createSessionTool = MCP_TOOLS.find(t => t.name === "create_session");
  assert.ok(createSessionTool, "CreateSession tool should exist");

  const properties = createSessionTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.workspacePath, "Should have workspacePath property");
});

test("mcp-server: SendSessionMessage tool has sessionId and message in properties", () => {
  const sendMessageTool = MCP_TOOLS.find(t => t.name === "send_session_message");
  assert.ok(sendMessageTool, "SendSessionMessage tool should exist");

  const properties = sendMessageTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.sessionId, "Should have sessionId property");
  assert.ok(properties.message, "Should have message property");
});

test("mcp-server: ResolveSessionPermission has sessionId, requestId, and decision", () => {
  const resolveTool = MCP_TOOLS.find(t => t.name === "resolve_session_permission");
  assert.ok(resolveTool, "ResolveSessionPermission tool should exist");

  const properties = resolveTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.sessionId, "Should have sessionId property");
  assert.ok(properties.requestId, "Should have requestId property");
  assert.ok(properties.decision, "Should have decision property");
});
