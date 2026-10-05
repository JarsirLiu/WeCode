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
export const WECODE_TOOL_NAMES = [
  "CreateSession",
  "SendSessionMessage",
  "ReadSession",
  "StopSessionGeneration",
  "SetSessionModel",
  "CompactSession",
  "ResolveSessionPermission",
  "WorkspaceList",
  "ListSessions",
] as const;

export type WeCodeToolName = (typeof WECODE_TOOL_NAMES)[number];

/**
 * MCP Tool definitions for all 9 WeCode session orchestration tools.
 *
 * Phase 1: Minimal tool stubs with basic input schemas.
 * Phase 2 will add full validation schemas and descriptions from contracts.
 */
export const MCP_TOOLS: Tool[] = [
  {
    name: "CreateSession",
    description: "Create a new WeCode session/task in the specified workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: {
          type: "string",
          description: "Absolute path to the workspace directory",
        },
        workspaceIdentity: {
          type: "string",
          description: "Optional workspace identity for remote sessions",
        },
        mode: {
          type: "string",
          enum: ["auto", "plan", "build", "edit", "yolo", "autoEdit"],
          description: "Approval mode for the session",
        },
        model: {
          type: "string",
          description: "AI model to use for this session",
        },
        initialPrompt: {
          type: "string",
          description: "Initial prompt to send to the session",
        },
      },
      required: ["workspacePath"],
    },
  },
  {
    name: "SendSessionMessage",
    description: "Send a message to an existing WeCode session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID returned by CreateSession",
        },
        message: {
          type: "string",
          description: "Message content to send to the session",
        },
      },
      required: ["sessionId", "message"],
    },
  },
  {
    name: "ReadSession",
    description: "Read the current state and history of a WeCode session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to read",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "StopSessionGeneration",
    description: "Stop an in-progress generation in a WeCode session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID where generation should be stopped",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "SetSessionModel",
    description: "Change the AI model used by a WeCode session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to update",
        },
        model: {
          type: "string",
          description: "New model ID to use",
        },
      },
      required: ["sessionId", "model"],
    },
  },
  {
    name: "CompactSession",
    description: "Compact a WeCode session to reduce memory and token usage.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to compact",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "ResolveSessionPermission",
    description:
      "Resolve a pending permission request in a WeCode session with delegated approval mode.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID with the pending permission",
        },
        requestId: {
          type: "string",
          description: "Permission request ID",
        },
        decision: {
          type: "string",
          enum: ["allow_once", "allow_always", "deny"],
          description: "Permission decision",
        },
        reason: {
          type: "string",
          description: "Optional reason for the decision",
        },
      },
      required: ["sessionId", "requestId", "decision"],
    },
  },
  {
    name: "WorkspaceList",
    description: "List all available WeCode workspaces on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ListSessions",
    description: "List all WeCode sessions in a specific workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: {
          type: "string",
          description: "Workspace path to list sessions from",
        },
      },
      required: ["workspacePath"],
    },
  },
];

/**
 * Find MCP Tool by name for quick lookup.
 */
export function findMcpTool(name: string): Tool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}
