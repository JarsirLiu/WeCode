import assert from "node:assert/strict";
import test from "node:test";
import { WECODE_TOOL_NAMES, MCP_TOOLS, type WeCodeToolName } from "../src/mcp/tool-adapter.js";

test("tool-adapter: WECODE_TOOL_NAMES includes all 9 session orchestration tools", () => {
  const expectedTools = [
    "create_session",
    "send_session_message",
    "read_session",
    "stop_session_generation",
    "set_session_model",
    "compact_session",
    "resolve_session_permission",
    "workspace_list",
    "list_sessions",
  ];

  assert.equal(WECODE_TOOL_NAMES.length, 9, "Should have exactly 9 tools");

  for (const toolName of expectedTools) {
    assert.ok(
      WECODE_TOOL_NAMES.includes(toolName as WeCodeToolName),
      `Tool "${toolName}" should be in WECODE_TOOL_NAMES`,
    );
  }
});

test("tool-adapter: MCP_TOOLS array has correct structure", () => {
  assert.equal(MCP_TOOLS.length, 9, "Should have 9 MCP tools");

  for (const tool of MCP_TOOLS) {
    assert.ok(tool.name, "Tool should have a name");
    assert.ok(tool.description, "Tool should have a description");
    assert.ok(tool.inputSchema, "Tool should have inputSchema");
    assert.equal(tool.inputSchema.type, "object", "Input schema should be object type");
  }
});

test("tool-adapter: MCP_TOOLS names match WECODE_TOOL_NAMES", () => {
  const mcpToolNames = MCP_TOOLS.map((t) => t.name);

  for (const toolName of WECODE_TOOL_NAMES) {
    assert.ok(mcpToolNames.includes(toolName), `Tool "${toolName}" should be in MCP_TOOLS`);
  }
});

test("tool-adapter: CreateSession tool has required input properties", () => {
  const createSessionTool = MCP_TOOLS.find((t) => t.name === "create_session");
  assert.ok(createSessionTool, "CreateSession tool should exist");

  const properties = createSessionTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.workspacePath, "Should have workspacePath property");
  assert.ok(properties.mode, "Should have mode property");
  assert.ok(properties.model, "Should have model property");
});

test("tool-adapter: SendSessionMessage tool has required input properties", () => {
  const sendMessageTool = MCP_TOOLS.find((t) => t.name === "send_session_message");
  assert.ok(sendMessageTool, "SendSessionMessage tool should exist");

  const properties = sendMessageTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.sessionId, "Should have sessionId property");
  assert.ok(properties.message, "Should have message property");
});

test("tool-adapter: ResolveSessionPermission tool has required input properties", () => {
  const resolveTool = MCP_TOOLS.find((t) => t.name === "resolve_session_permission");
  assert.ok(resolveTool, "ResolveSessionPermission tool should exist");

  const properties = resolveTool.inputSchema.properties as Record<string, unknown>;
  assert.ok(properties.sessionId, "Should have sessionId property");
  assert.ok(properties.requestId, "Should have requestId property");
  assert.ok(properties.decision, "Should have decision property");
});

test("tool-adapter: ListSessions tool exists with minimal input schema", () => {
  const listTool = MCP_TOOLS.find((t) => t.name === "list_sessions");
  assert.ok(listTool, "ListSessions tool should exist");
  assert.ok(listTool.inputSchema, "Should have inputSchema");
});

test("tool-adapter: WorkspaceList tool exists with minimal input schema", () => {
  const workspaceTool = MCP_TOOLS.find((t) => t.name === "workspace_list");
  assert.ok(workspaceTool, "WorkspaceList tool should exist");
  assert.ok(workspaceTool.inputSchema, "Should have inputSchema");
});

test("tool-adapter: session management schemas document ID-only routing and actual V4 options", () => {
  const read = MCP_TOOLS.find((tool) => tool.name === "read_session");
  const compact = MCP_TOOLS.find((tool) => tool.name === "compact_session");
  const setModel = MCP_TOOLS.find((tool) => tool.name === "set_session_model");
  assert.ok(read?.description.includes("Host resolves its workspace"));
  assert.ok(compact);
  assert.equal("instructions" in (compact.inputSchema.properties as object), false);
  assert.ok(setModel?.inputSchema.anyOf);
  const readProperties = read?.inputSchema.properties as Record<string, unknown>;
  assert.ok(readProperties.messageLimit);
  assert.ok(readProperties.afterSeq);
});
