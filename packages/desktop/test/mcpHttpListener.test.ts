import assert from "node:assert/strict";
import test from "node:test";
import { ServiceCollection, ISettingService } from "@zcode/services";
import { startDesktopMcpHttpListener } from "../src/host/mcpHttpListener.js";

test("desktop MCP listener serves a real loopback HTTP handshake", async () => {
  const services = new ServiceCollection().register(ISettingService, {
    get: async () => ({ mcpEnabled: true }),
    listWorkspaces: async () => [],
  } as never);
  const listener = await startDesktopMcpHttpListener(services, { port: 39174 });
  assert.ok(listener);
  try {
    const health = await fetch("http://127.0.0.1:39174/mcp", { method: "HEAD" });
    assert.equal(health.status, 204);
    const initialize = await fetch("http://127.0.0.1:39174/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "desktop-staging", version: "1.0.0" },
        },
      }),
    });
    assert.equal(initialize.status, 200);
    assert.ok((await initialize.json() as { result?: { capabilities?: { tools?: unknown } } }).result?.capabilities?.tools);
  } finally {
    await listener.close();
  }
});

test("desktop MCP listener reports fixed-port conflicts instead of replacing the port", async () => {
  const services = new ServiceCollection().register(ISettingService, {
    get: async () => ({ mcpEnabled: true }),
    listWorkspaces: async () => [],
  } as never);
  const first = await startDesktopMcpHttpListener(services, { port: 39175 });
  assert.ok(first);
  try {
    const errors: Error[] = [];
    const second = await startDesktopMcpHttpListener(services, {
      port: 39175,
      onError: (error) => errors.push(error),
    });
    assert.equal(second, undefined);
    assert.ok(errors.some((error) => "code" in error && (error as Error & { code?: string }).code === "EADDRINUSE"));
  } finally {
    await first.close();
  }
});
