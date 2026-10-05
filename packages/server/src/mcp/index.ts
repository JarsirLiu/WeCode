/**
 * WeCode MCP Server (stdio transport)
 *
 * Provides 9 AI Session Orchestration tools via the official MCP SDK.
 * Phase 1: local stdio transport only.
 *
 * Usage (from CLI):
 *   const server = createWeCodeMcpServer(toolHandler);
 *   await server.connect(process.stdin, process.stdout);
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS } from "./tool-adapter.js";
import { isWeCodeSessionTool } from "./tool-registry.js";

/**
 * Tool handler function signature.
 * Receives tool name and arguments, returns result or throws error.
 * Injected at startup by CLI layer (packages/zcode-server-cli).
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
      version: "1.0.0",
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

/**
 * Connect MCP server to stdio and start listening.
 *
 * @param server - The MCP server instance
 */
export async function connectMcpServerStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs indefinitely, handling incoming MCP requests
}

/**
 * Create and start a WeCode MCP server on stdio.
 * This is the main entry point for the mcp stdio CLI subcommand.
 *
 * @param toolHandler - Function to dispatch tool calls
 */
export async function startMcpServer(toolHandler: WeCodeToolHandler): Promise<void> {
  const server = createWeCodeMcpServer(toolHandler);
  await connectMcpServerStdio(server);
}
