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
  create_session: "create-session",
  send_session_message: "send-session-message",
  read_session: "read-session",
  stop_session_generation: "stop-session-generation",
  set_session_model: "set-session-model",
  compact_session: "compact-session",
  resolve_session_permission: "resolve-session-permission",
  workspace_list: "workspace-list",
  list_sessions: "list-sessions",
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
