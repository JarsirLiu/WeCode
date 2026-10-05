/**
 * Tool Registry: MCP Tool Name → Core Handler
 *
 * Maps MCP tool calls to the actual handler implementations in core.
 * Handlers are injected at runtime via ToolExecutionContext.
 *
 * Phase 1: Maps to handler module names. Phase 2 will integrate
 * actual handler injection from @zcode/core.
 */

/**
 * Handler name constants for tool dispatching.
 * Maps 1:1 to handler files in apps/zcode-cli/packages/core/src/tool/handlers/
 */
export const TOOL_HANDLER_NAMES: Record<string, string> = {
  CreateSession: "create-session",
  SendSessionMessage: "send-session-message",
  ReadSession: "read-session",
  StopSessionGeneration: "stop-session-generation",
  SetSessionModel: "set-session-model",
  CompactSession: "compact-session",
  ResolveSessionPermission: "resolve-session-permission",
  WorkspaceList: "workspace-list",
  ListSessions: "list-sessions",
};

/**
 * Get the handler module name for a given MCP tool name.
 * @param toolName The MCP tool name (e.g., "CreateSession")
 * @returns Handler module name (e.g., "create-session") or undefined if not found
 */
export function getHandlerNameForTool(toolName: string): string | undefined {
  return TOOL_HANDLER_NAMES[toolName];
}

/**
 * Check if a tool name is a known WeCode session orchestration tool.
 */
export function isWeCodeSessionTool(toolName: string): boolean {
  return toolName in TOOL_HANDLER_NAMES;
}

/**
 * Get all registered WeCode tool names.
 */
export function getAllWeCodeToolNames(): string[] {
  return Object.keys(TOOL_HANDLER_NAMES);
}
