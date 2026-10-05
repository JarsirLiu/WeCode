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
/**
 * Tool handler function signature.
 * Receives tool name and arguments, returns result or throws error.
 * Injected at startup by CLI layer (packages/zcode-server-cli).
 */
export type WeCodeToolHandler = (toolName: string, toolArgs: Record<string, unknown>) => Promise<unknown>;
/**
 * Create a WeCode MCP server instance.
 *
 * @param toolHandler - Function to dispatch tool calls to actual handlers
 * @returns MCP server configured with WeCode session orchestration tools
 */
export declare function createWeCodeMcpServer(toolHandler: WeCodeToolHandler): Server;
/**
 * Connect MCP server to stdio and start listening.
 *
 * @param server - The MCP server instance
 */
export declare function connectMcpServerStdio(server: Server): Promise<void>;
/**
 * Create and start a WeCode MCP server on stdio.
 * This is the main entry point for the mcp stdio CLI subcommand.
 *
 * @param toolHandler - Function to dispatch tool calls
 */
export declare function startMcpServer(toolHandler: WeCodeToolHandler): Promise<void>;
//# sourceMappingURL=index.d.ts.map