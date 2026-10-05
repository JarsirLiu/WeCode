export { createHttpServer } from "./http.js";

// MCP server exports (Phase 1: stdio transport only)
export { createWeCodeMcpServer, connectMcpServerStdio, startMcpServer } from "./mcp/index.js";
export type { WeCodeToolHandler } from "./mcp/index.js";
