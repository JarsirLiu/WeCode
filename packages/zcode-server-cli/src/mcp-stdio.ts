/**
 * MCP stdio subcommand handler
 *
 * Launches the WeCode MCP server on stdio for integration with Claude Desktop
 * and other MCP-compatible clients.
 */

import { startMcpServer, type WeCodeToolHandler } from "@zcode/server";
import type { CliIO } from "./cli.js";

/**
 * Run the MCP stdio server.
 *
 * @param args Command arguments
 * @param io CLI I/O interface
 * @param toolHandler Function to dispatch tool calls to handlers
 */
export async function runMcpStdio(
  args: readonly string[],
  io: CliIO,
  toolHandler: WeCodeToolHandler,
): Promise<number> {
  try {
    // Don't log to stderr during MCP operation — the protocol uses stdio exclusively
    // and any extra output breaks JSON-RPC communication with the client
    
    // Start the MCP server on stdio
    await startMcpServer(toolHandler);

    // If we exit cleanly, return 0
    return 0;
  } catch (error) {
    // Log errors to stderr after MCP exits (won't interfere with protocol)
    const message = error instanceof Error ? error.message : String(error);
    io.stderr?.write(`MCP Server error: ${message}\n`);
    return 1;
  }
}

/**
 * Create a tool handler that bridges MCP tool calls to core handlers.
 *
 * Phase 1: Stub implementation. The actual handler injection from
 * @zcode/core will be wired up in a future phase when we have
 * the proper abstraction for ToolExecutor in the contracts layer.
 */
export function createWeCodeToolHandler(): WeCodeToolHandler {
  return async (_toolName: string, _toolArgs: Record<string, unknown>) => {
    // TODO: Wire up actual handler implementations from @zcode/core
    // This will dispatch to apps/zcode-cli/packages/core/src/tool/handlers/
    throw new Error(
      `Tool handler not yet implemented for: ${_toolName}. Phase 2 will integrate core handlers.`,
    );
  };
}

