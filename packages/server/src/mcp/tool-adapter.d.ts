/**
 * MCP Tool Adapter
 *
 * Converts WeCode AI Session Orchestration tools to MCP Tool format.
 * These are the 9 tools exposed by the MCP server.
 *
 * Phase 1: Tool definitions are self-contained here to avoid cross-workspace
 * dependencies. Phase 2 will refactor to import from @zcode/contracts.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
/**
 * Tool names for the 9 AI Session Orchestration tools.
 * Must match the names in apps/zcode-cli/packages/contracts/src/tools/ai-session-orchestration.ts
 */
export declare const WECODE_TOOL_NAMES: readonly ["CreateSession", "SendSessionMessage", "ReadSession", "StopSessionGeneration", "SetSessionModel", "CompactSession", "ResolveSessionPermission", "WorkspaceList", "ListSessions"];
export type WeCodeToolName = (typeof WECODE_TOOL_NAMES)[number];
/**
 * MCP Tool definitions for all 9 WeCode session orchestration tools.
 *
 * Phase 1: Minimal tool stubs with basic input schemas.
 * Phase 2 will add full validation schemas and descriptions from contracts.
 */
export declare const MCP_TOOLS: Tool[];
/**
 * Find MCP Tool by name for quick lookup.
 */
export declare function findMcpTool(name: string): Tool | undefined;
//# sourceMappingURL=tool-adapter.d.ts.map