import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

const sessionId = z.string().trim().min(1);
const workspacePath = z.string().trim().min(1);
const workspaceIdentity = z.string().trim().min(1);

export const McpWorkspaceListInputSchema = z.object({}).strict();
export const McpListSessionsInputSchema = z
  .object({
    workspacePath,
    workspaceIdentity: workspaceIdentity.optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();
export const McpCreateSessionInputSchema = z
  .object({
    workspacePath,
    workspaceIdentity: workspaceIdentity.optional(),
    mode: z.enum(["auto", "plan", "build", "edit", "yolo", "autoEdit"]).optional(),
    message: z.string().min(1),
  })
  .strict();
export const McpSendSessionMessageInputSchema = z
  .object({
    sessionId,
    message: z.string().min(1),
    traceId: z.string().trim().min(1).optional(),
  })
  .strict();
export const McpReadSessionInputSchema = z
  .object({
    sessionId,
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(),
  })
  .strict();
export const McpStopSessionGenerationInputSchema = z.object({ sessionId }).strict();
export const McpSetSessionModelInputSchema = z
  .object({
    sessionId,
    model: z.string().trim().min(1).optional(),
    modelSelection: z.record(z.string(), z.unknown()).optional(),
    traceId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((value) => value.model !== undefined || value.modelSelection !== undefined);
export const McpCompactSessionInputSchema = z.object({ sessionId }).strict();
export const McpResolveSessionPermissionInputSchema = z
  .object({
    sessionId,
    requestId: z.string().trim().min(1),
    decision: z.enum(["allow_once", "allow_always", "deny"]),
    reason: z.string().max(4096).optional(),
  })
  .strict();

export const MCP_SESSION_TOOL_INPUT_SCHEMAS = {
  workspace_list: McpWorkspaceListInputSchema,
  list_sessions: McpListSessionsInputSchema,
  create_session: McpCreateSessionInputSchema,
  send_session_message: McpSendSessionMessageInputSchema,
  read_session: McpReadSessionInputSchema,
  stop_session_generation: McpStopSessionGenerationInputSchema,
  set_session_model: McpSetSessionModelInputSchema,
  compact_session: McpCompactSessionInputSchema,
  resolve_session_permission: McpResolveSessionPermissionInputSchema,
} as const;

export type McpSessionToolName = keyof typeof MCP_SESSION_TOOL_INPUT_SCHEMAS;

const inputJsonSchemas = Object.fromEntries(
  Object.entries(MCP_SESSION_TOOL_INPUT_SCHEMAS).map(([name, schema]) => [
    name,
    toToolJsonSchema(schema),
  ]),
) as Record<McpSessionToolName, Record<string, unknown>>;
inputJsonSchemas.set_session_model.anyOf = [
  { required: ["model"] },
  { required: ["modelSelection"] },
];

export const MCP_SESSION_TOOL_JSON_SCHEMAS = inputJsonSchemas;

export const MCP_SESSION_TOOL_DESCRIPTIONS: Record<McpSessionToolName, string> = {
  workspace_list: "List workspaces known to the WeCode Host, including local and remote workspaces.",
  list_sessions: "List sessions in a workspace. Use workspacePath from workspace_list; workspaceIdentity may identify a remote workspace.",
  create_session: "Create a WeCode session in the specified workspace and send its required first message. Returns its sessionId. The session uses yolo mode and the Host default model by default; use set_session_model after creation to change the model.",
  send_session_message: "Send a message prompt to a session. sessionId is the target returned by create_session; Host resolves its workspace. The admission result is returned before the turn finishes.",
  read_session: "Read a session's authoritative state and history. Host resolves its workspace from sessionId. Use messageLimit and afterSeq to bound or incrementally read history.",
  stop_session_generation: "Stop the current generation in a session. Host resolves its workspace from sessionId.",
  set_session_model: "Change a session's model using model (provider/model) or structured modelSelection. Host resolves its workspace from sessionId.",
  compact_session: "Compact a session using the Host's V4 compact operation. Host resolves its workspace from sessionId.",
  resolve_session_permission: "Resolve one pending permission request identified by requestId in the target session.",
};
