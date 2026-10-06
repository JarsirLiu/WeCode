import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildWeCodeMcpClientConfig,
  createWeCodeMcpClientConfigJson,
  DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES,
  findWeCodeMcpServerCliPath,
  resolveWeCodeMcpEntrypoint,
  WECODE_MCP_SERVER_KEY,
  WECODE_MCP_STDIO_SUBCOMMAND,
} from "../src/mcp/index.js";

const NODE_BIN = "C:/tools/node/node.exe";
const SERVER_CLI = "D:/app/runtime/server-cli.js";

test("mcp-client-config: buildWeCodeMcpClientConfig emits the standard mcpServers wrapper", () => {
  const config = buildWeCodeMcpClientConfig({ node: NODE_BIN, serverCli: SERVER_CLI });

  assert.deepEqual(Object.keys(config), ["mcpServers"]);
  assert.deepEqual(Object.keys(config.mcpServers), [WECODE_MCP_SERVER_KEY]);
});

test("mcp-client-config: server key uses the wecode identity, not the legacy zcode name", () => {
  assert.equal(WECODE_MCP_SERVER_KEY, "wecode");
  assert.notEqual(WECODE_MCP_SERVER_KEY, "zcode");
});

test("mcp-client-config: stdio entrypoint is command + absolute entry + subcommand", () => {
  const entry = buildWeCodeMcpClientConfig({
    node: NODE_BIN,
    serverCli: SERVER_CLI,
  }).mcpServers[WECODE_MCP_SERVER_KEY];

  assert.equal(entry?.command, NODE_BIN);
  assert.deepEqual(entry?.args, [SERVER_CLI, ...WECODE_MCP_STDIO_SUBCOMMAND]);
  assert.deepEqual(WECODE_MCP_STDIO_SUBCOMMAND, ["mcp", "stdio"]);
});

test("mcp-client-config: env values are all strings so MCP clients accept them", () => {
  const entry = buildWeCodeMcpClientConfig({
    node: NODE_BIN,
    serverCli: SERVER_CLI,
  }).mcpServers[WECODE_MCP_SERVER_KEY];

  assert.ok(entry?.env);
  for (const [key, value] of Object.entries(entry.env)) {
    assert.equal(typeof key, "string");
    assert.equal(typeof value, "string");
  }
});

test("mcp-client-config: rejects a missing node runtime", () => {
  assert.throws(
    () => buildWeCodeMcpClientConfig({ node: "   ", serverCli: SERVER_CLI }),
    /node runtime path/,
  );
});

test("mcp-client-config: rejects a relative server-cli path", () => {
  assert.throws(
    () => buildWeCodeMcpClientConfig({ node: NODE_BIN, serverCli: "packages/zcode-server-cli/dist/server-cli.js" }),
    /absolute server-cli path/,
  );
});

test("mcp-client-config: JSON output round-trips and is newline terminated", () => {
  const json = createWeCodeMcpClientConfigJson({ node: NODE_BIN, serverCli: SERVER_CLI });

  assert.ok(json.endsWith("\n"));
  const parsed = JSON.parse(json) as { mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> };
  assert.equal(parsed.mcpServers[WECODE_MCP_SERVER_KEY]?.command, NODE_BIN);
  assert.deepEqual(parsed.mcpServers[WECODE_MCP_SERVER_KEY]?.args, [SERVER_CLI, "mcp", "stdio"]);
});

test("mcp-client-config: resolveWeCodeMcpEntrypoint resolves the entry in this checkout", () => {
  const result = resolveWeCodeMcpEntrypoint({ node: NODE_BIN });

  assert.equal(result.ok, true, "expected an entrypoint to resolve in the repo checkout");
  if (!result.ok) return;
  assert.equal(result.entrypoint.node, NODE_BIN);
  assert.ok(result.entrypoint.serverCli.endsWith(".js") || result.entrypoint.serverCli.endsWith(".ts"));
  assert.ok(DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES.includes(result.matchedLayout));
});

test("mcp-client-config: resolveWeCodeMcpEntrypoint reports unavailable instead of emitting a broken config", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "wecode-mcp-"));
  try {
    const result = resolveWeCodeMcpEntrypoint({
      node: NODE_BIN,
      anchors: [emptyDir],
      candidates: [["no", "such", "entry.js"]],
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /WeCode/);
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

test("mcp-client-config: findWeCodeMcpServerCliPath walks up from the anchor and honours candidate order", async () => {
  const root = await mkdtemp(join(tmpdir(), "wecode-mcp-layout-"));
  try {
    const nested = join(root, "packages", "server", "src", "mcp");
    await mkdir(nested, { recursive: true });
    const srcEntry = join(root, "packages", "zcode-server-cli", "src", "main.ts");
    const distEntry = join(root, "packages", "zcode-server-cli", "dist", "server-cli.js");
    await mkdir(join(root, "packages", "zcode-server-cli", "src"), { recursive: true });
    await writeFile(srcEntry, "export {};\n", "utf8");
    await mkdir(join(root, "packages", "zcode-server-cli", "dist"), { recursive: true });
    await writeFile(distEntry, "export {};\n", "utf8");

    // 默认候选里 dist 产物优先于源码入口
    assert.equal(
      findWeCodeMcpServerCliPath([join(nested, "index.ts")]),
      distEntry,
    );

    // 反向候选顺序改变解析结果，证明顺序是受控的
    assert.equal(
      findWeCodeMcpServerCliPath([join(nested, "index.ts")], [
        ["packages", "zcode-server-cli", "src", "main.ts"],
      ]),
      srcEntry,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
