import assert from "node:assert/strict";
import test from "node:test";
import {
  isWeCodeSessionTool,
  getHandlerNameForTool,
  getAllWeCodeToolNames,
  TOOL_HANDLER_NAMES,
} from "../src/mcp/tool-registry.js";

test("tool-registry: isWeCodeSessionTool validates tool names correctly", () => {
  assert.ok(isWeCodeSessionTool("CreateSession"), 'Should recognize "CreateSession"');
  assert.ok(isWeCodeSessionTool("SendSessionMessage"), 'Should recognize "SendSessionMessage"');
  assert.ok(isWeCodeSessionTool("ResolveSessionPermission"), 'Should recognize "ResolveSessionPermission"');
  assert.ok(isWeCodeSessionTool("ListSessions"), 'Should recognize "ListSessions"');

  assert.ok(!isWeCodeSessionTool("InvalidTool"), 'Should reject "InvalidTool"');
  assert.ok(!isWeCodeSessionTool(""), 'Should reject empty string');
  assert.ok(!isWeCodeSessionTool("createSession"), 'Should reject lowercase variant');
});

test("tool-registry: getHandlerNameForTool returns correct handler names", () => {
  assert.equal(
    getHandlerNameForTool("CreateSession"),
    TOOL_HANDLER_NAMES.CreateSession,
    "CreateSession should map to create_session handler"
  );

  assert.equal(
    getHandlerNameForTool("SendSessionMessage"),
    TOOL_HANDLER_NAMES.SendSessionMessage,
    "SendSessionMessage should map to send_session_message handler"
  );

  assert.equal(
    getHandlerNameForTool("ResolveSessionPermission"),
    TOOL_HANDLER_NAMES.ResolveSessionPermission,
    "ResolveSessionPermission should map to resolve_session_permission handler"
  );
});

test("tool-registry: getHandlerNameForTool returns undefined for invalid tool names", () => {
  const result1 = getHandlerNameForTool("InvalidTool");
  assert.equal(result1, undefined, "Should return undefined for unknown tool");

  const result2 = getHandlerNameForTool("");
  assert.equal(result2, undefined, "Should return undefined for empty tool name");

  const result3 = getHandlerNameForTool("createSession");
  assert.equal(result3, undefined, "Should return undefined for case-sensitive mismatch");
});

test("tool-registry: getAllWeCodeToolNames returns all 9 tools", () => {
  const allTools = getAllWeCodeToolNames();

  assert.equal(allTools.length, 9, "Should return exactly 9 tools");

  const expectedTools = [
    "CreateSession",
    "SendSessionMessage",
    "ReadSession",
    "StopSessionGeneration",
    "SetSessionModel",
    "CompactSession",
    "ResolveSessionPermission",
    "WorkspaceList",
    "ListSessions",
  ];

  for (const tool of expectedTools) {
    assert.ok(allTools.includes(tool), `Tool "${tool}" should be in list`);
  }
});

test("tool-registry: TOOL_HANDLER_NAMES contains all tool-to-handler mappings", () => {
  const allTools = getAllWeCodeToolNames();

  for (const tool of allTools) {
    const handlerName = TOOL_HANDLER_NAMES[tool as keyof typeof TOOL_HANDLER_NAMES];
    assert.ok(handlerName, `Should have handler mapping for "${tool}"`);
    assert.equal(typeof handlerName, "string", `Handler name should be a string for "${tool}"`);
  }
});

test("tool-registry: Tool handler names use kebab-case convention", () => {
  const allTools = getAllWeCodeToolNames();
  const kebabCasePattern = /^[a-z]+((-[a-z]+)+)?$/;

  for (const tool of allTools) {
    const handlerName = TOOL_HANDLER_NAMES[tool as keyof typeof TOOL_HANDLER_NAMES];
    assert.match(
      handlerName,
      kebabCasePattern,
      `Handler "${handlerName}" for tool "${tool}" should use kebab-case`
    );
  }
});
