import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ServiceCollection } from "@zcode/services";
import { ISettingService } from "@zcode/services";
import { createWeCodeMcpServer, type WeCodeToolHandler } from "./index.js";

export const MCP_HTTP_PATH = "/mcp";
/** Stable local port for external MCP clients; Host/RPC uses its own dynamic port. */
// 选择非开发服务器常用区段的固定端口，保证外部 Agent 配置跨重启稳定。
export const DEFAULT_MCP_HTTP_PORT = 39173;

export interface McpHttpHandlerOptions {
  services: ServiceCollection;
  toolHandler?: WeCodeToolHandler;
  authToken?: string;
}

function hasBearer(request: Request, token: string): boolean {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

/** Stateless MCP Streamable HTTP handler. The host remains the sole task/session owner. */
export function createMcpHttpHandler(options: McpHttpHandlerOptions) {
  const handler = options.toolHandler ?? (async () => {
    throw new Error("MCP tool handler is not connected to a Host");
  });
  return async (request: Request): Promise<Response> => {
    if (options.authToken && !hasBearer(request, options.authToken)) {
      return Response.json({ error: "WECODE_MCP_AUTH_REQUIRED" }, { status: 401 });
    }
    const settings = options.services.getOptional(ISettingService);
    if (settings && !(await settings.get()).mcpEnabled) {
      return Response.json({ error: "WECODE_MCP_DISABLED" }, { status: 403 });
    }
    // Desktop uses a side-effect-free probe before displaying a copyable config.
    // Keep it on /mcp so readiness does not create a second public endpoint.
    if (request.method === "HEAD") {
      return new Response(null, { status: 204 });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createWeCodeMcpServer(handler);
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  };
}
