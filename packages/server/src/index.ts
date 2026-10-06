export { createHttpServer } from "./http.js";
export { createMcpHttpHandler, DEFAULT_MCP_HTTP_PORT, MCP_HTTP_PATH } from "./mcp/http.js";

// MCP protocol exports. Streamable HTTP is the supported external transport.
export { createWeCodeMcpServer } from "./mcp/index.js";
export type { WeCodeToolHandler } from "./mcp/index.js";
export { createHostMcpToolHandler } from "./mcp/index.js";
