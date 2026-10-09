import {
  ISettingService,
  IZCodeSessionService,
  IZCodeTaskService,
  type ServiceCollection,
} from "@zcode/services";
import { parseModelPickerValue } from "@zcode/shared";
import { randomUUID } from "node:crypto";
import {
  MCP_SESSION_TOOL_INPUT_SCHEMAS,
  type McpSessionToolName,
} from "@zcode/contracts/tools/mcp-session-orchestration";
import type { WeCodeToolHandler } from "./index.js";

/** MCP 只调用 Host public services，不维护第二份 session/task 状态。 */
export function createHostMcpToolHandler(services: ServiceCollection): WeCodeToolHandler {
  return async (toolName, rawArgs) => {
    // MCP 参数以 tools/list schema 为准，不猜别名，也不从 Host 本地状态补调用方字段。
    const schema = MCP_SESSION_TOOL_INPUT_SCHEMAS[toolName as McpSessionToolName];
    if (!schema) throw new Error(`Unknown WeCode MCP tool: ${toolName}`);
    const parsed = schema.safeParse(rawArgs);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "<root>");
      throw new Error(
        `WECODE_MCP_INVALID_ARGUMENTS: invalid ${toolName} arguments (${fields.join(", ")})`,
      );
    }
    const args = parsed.data as Record<string, any>;
    const settings = services.get(ISettingService);
    if (!(await settings.get()).mcpEnabled) {
      throw new Error("WECODE_MCP_DISABLED: MCP access is disabled in WeCode settings");
    }
    const task = services.get(IZCodeTaskService);
    const session = services.get(IZCodeSessionService);
    const assertWorkspaceAllowed = async (workspacePath: unknown, workspaceIdentity?: unknown) => {
      const path = typeof workspacePath === "string" ? workspacePath.trim() : "";
      const identity = typeof workspaceIdentity === "string" ? workspaceIdentity.trim() : "";
      const requestedKey = identity || path;
      const allowed = (await settings.listWorkspaces()).some((entry) => {
        const entryKey = entry.workspaceIdentity?.trim() || entry.workspacePath;
        return entryKey === requestedKey;
      });
      if (!requestedKey || !allowed) {
        throw new Error("WECODE_MCP_WORKSPACE_FORBIDDEN: workspace is not available to this Host");
      }
      return {
        workspacePath: path,
        ...(identity ? { workspaceIdentity: identity } : {}),
      };
    };
    const resolveSessionWorkspace = async (sessionId: unknown) => {
      const id = typeof sessionId === "string" ? sessionId.trim() : "";
      if (!id) throw new Error("WECODE_MCP_WORKSPACE_FORBIDDEN: sessionId is required");
      let target: { workspacePath: string; workspaceIdentity?: string };
      try {
        target = await task.resolveTaskTarget({ taskId: id });
      } catch {
        throw new Error("WECODE_MCP_WORKSPACE_FORBIDDEN: session is not available to this Host");
      }
      return assertWorkspaceAllowed(target.workspacePath, target.workspaceIdentity);
    };
    switch (toolName) {
      case "workspace_list":
        return { workspaces: await settings.listWorkspaces() };
      case "list_sessions": {
        const workspace = await assertWorkspaceAllowed(args.workspacePath, args.workspaceIdentity);
        return await session.listSessions({
          ...workspace,
          includeArchived: args.includeArchived,
          limit: args.limit,
        });
      }
      case "create_session": {
        const workspace = await assertWorkspaceAllowed(args.workspacePath, args.workspaceIdentity);
        const result = await task.createTask({
          ...workspace,
          mode: args.mode ?? "yolo",
          ...(args.modelSelection ? { modelSelection: args.modelSelection } : {}),
          ...(typeof args.model === "string" ? { model: args.model } : {}),
          v4Create: true,
        });
        await task.sendPrompt({
          taskId: result.taskId,
          ...workspace,
          traceId: randomUUID(),
          content: args.message,
          clientLabel: "mcp",
          clientMode: "desktop-continuous",
        });
        return result;
      }
      case "send_session_message": {
        const workspace = await resolveSessionWorkspace(args.sessionId);
        return await task.sendPrompt({
          taskId: args.sessionId,
          ...workspace,
          traceId: args.traceId ?? randomUUID(),
          content: args.message,
          clientLabel: "mcp",
          clientMode: "desktop-continuous",
        });
      }
      case "read_session": {
        const workspace = await resolveSessionWorkspace(args.sessionId);
        // messageLimit/afterSeq 是公开的增量读取参数，必须一路传到会话事实源。
        return await session.readSession({
          sessionId: args.sessionId,
          ...workspace,
          messageLimit: args.messageLimit,
          afterSeq: args.afterSeq,
        });
      }
      case "stop_session_generation": {
        const workspace = await resolveSessionWorkspace(args.sessionId);
        return await task.stopGeneration({ taskId: args.sessionId, ...workspace });
      }
      case "set_session_model": {
        await resolveSessionWorkspace(args.sessionId);
        const modelSelection = args.modelSelection ?? parseModelPickerValue(args.model);
        return await task.setModel({
          taskId: args.sessionId,
          traceId: args.traceId ?? randomUUID(),
          modelSelection,
        });
      }
      case "compact_session": {
        const workspace = await resolveSessionWorkspace(args.sessionId);
        return await task.compactSession({ taskId: args.sessionId, ...workspace });
      }
      case "resolve_session_permission": {
        const workspace = await resolveSessionWorkspace(args.sessionId);
        const decision = args.decision === "deny" ? "deny" : "allow";
        return await task.respondPermission({
          taskId: args.sessionId,
          requestId: args.requestId,
          optionId: args.decision,
          response: { decision, ...(args.reason ? { reason: args.reason } : {}) },
          ...workspace,
          resolution: { resolverKind: "ai", resolverSessionId: "mcp", reason: args.reason },
        });
      }
      default:
        throw new Error(`Unknown WeCode MCP tool: ${toolName}`);
    }
  };
}
