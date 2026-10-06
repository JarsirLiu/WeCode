import {
  MCP_SESSION_TOOL_DESCRIPTIONS,
  MCP_SESSION_TOOL_JSON_SCHEMAS,
  type McpSessionToolName,
  MCP_SESSION_TOOL_INPUT_SCHEMAS,
} from "@zcode/contracts/tools/mcp-session-orchestration";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const WECODE_TOOL_NAMES = Object.keys(
  MCP_SESSION_TOOL_INPUT_SCHEMAS,
) as McpSessionToolName[];

export type WeCodeToolName = McpSessionToolName;

export const MCP_TOOLS: Tool[] = WECODE_TOOL_NAMES.map((name) => ({
  name,
  description: MCP_SESSION_TOOL_DESCRIPTIONS[name],
  inputSchema: MCP_SESSION_TOOL_JSON_SCHEMAS[name] as Tool["inputSchema"],
}));

export function findMcpTool(name: string): Tool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}
