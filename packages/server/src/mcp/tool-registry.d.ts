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
export declare const TOOL_HANDLER_NAMES: Record<string, string>;
/**
 * Get the handler module name for a given MCP tool name.
 * @param toolName The MCP tool name (e.g., "CreateSession")
 * @returns Handler module name (e.g., "create-session") or undefined if not found
 */
export declare function getHandlerNameForTool(toolName: string): string | undefined;
/**
 * Check if a tool name is a known WeCode session orchestration tool.
 */
export declare function isWeCodeSessionTool(toolName: string): boolean;
/**
 * Get all registered WeCode tool names.
 */
export declare function getAllWeCodeToolNames(): string[];
//# sourceMappingURL=tool-registry.d.ts.map