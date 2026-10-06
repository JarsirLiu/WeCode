/** WeCode MCP tool server used by the Streamable HTTP adapter. */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS } from "./tool-adapter.js";
import { isWeCodeSessionTool } from "./tool-registry.js";

/** First externally supported WeCode MCP HTTP contract version. */
export const WECODE_MCP_SERVER_VERSION = "0.1.0";

export {
  buildWeCodeMcpClientConfig,
  createWeCodeMcpClientConfigJson,
  WECODE_MCP_SERVER_KEY,
  type WeCodeMcpClientConfig,
} from "./client-config.js";
export { DEFAULT_MCP_HTTP_PORT } from "./http.js";

/**
 * Tool handler function signature.
 * Receives tool name and arguments, returns result or throws error.
 * Injected at startup by the HTTP Host assembly layer.
 */
export type WeCodeToolHandler = (
  toolName: string,
  toolArgs: Record<string, unknown>
) => Promise<unknown>;

/**
 * Create a WeCode MCP server instance.
 *
 * @param toolHandler - Function to dispatch tool calls to actual handlers
 * @returns MCP server configured with WeCode session orchestration tools
 */
export function createWeCodeMcpServer(toolHandler: WeCodeToolHandler): Server {
  const server = new Server(
    {
      name: "wecode-session-orchestration",
      version: WECODE_MCP_SERVER_VERSION,
    },
    {
      // 声明服务器支持 tools 能力
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOLS,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments ?? {};

    // Validate tool is registered
    if (!isWeCodeSessionTool(toolName)) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${toolName}. Available tools: ${MCP_TOOLS.map((t) => t.name).join(", ")}`,
          } as TextContent,
        ],
        isError: true,
      };
    }

    try {
      // Dispatch to handler
      const result = await toolHandler(toolName, toolArgs as Record<string, unknown>);

      // Serialize result
      const resultText = typeof result === "string" ? result : JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: resultText,
          } as TextContent,
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Tool execution failed: ${errorMessage}`,
          } as TextContent,
        ],
        isError: true,
      };
    }
  });

  return server;
}

export { createHostMcpToolHandler } from "./host-tool-handler.js";
