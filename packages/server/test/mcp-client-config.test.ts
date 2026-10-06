import assert from "node:assert/strict";
import test from "node:test";
import { buildWeCodeMcpClientConfig, createWeCodeMcpClientConfigJson, WECODE_MCP_SERVER_KEY } from "../src/mcp/index.js";

test("MCP config is one stable HTTP entry", () => {
  const config = buildWeCodeMcpClientConfig({ url: "http://127.0.0.1:3030/mcp" });
  assert.deepEqual(config, {
    mcpServers: {
      wecode: { type: "streamable_http", url: "http://127.0.0.1:3030/mcp" },
    },
  });
  assert.deepEqual(Object.keys(config.mcpServers), [WECODE_MCP_SERVER_KEY]);
});

test("MCP config supports short-lived auth headers and no process command", () => {
  const parsed = JSON.parse(createWeCodeMcpClientConfigJson({
    url: "https://api.example.com/mcp",
    headers: { Authorization: "Bearer short-lived" },
  }));
  const entry = parsed.mcpServers.wecode;
  assert.equal(entry.type, "streamable_http");
  assert.equal(entry.url, "https://api.example.com/mcp");
  assert.equal(entry.headers.Authorization, "Bearer short-lived");
  assert.equal("command" in entry, false);
});

test("MCP config rejects non HTTP URLs", () => {
  assert.throws(() => buildWeCodeMcpClientConfig({ url: "stdio://wecode" }), /HTTP/);
});
