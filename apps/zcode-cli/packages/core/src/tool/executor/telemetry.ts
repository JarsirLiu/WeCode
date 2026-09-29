import {
  CoreErrorType,
  type AgentTelemetryErrorCategory,
  type ToolExecutionSpanWriter,
} from "@zcode/contracts";
import type { ExecutableToolCall, ToolExecutionResult } from "../types.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "./types.js";

export function errorCategoryForToolError(type: string | undefined): AgentTelemetryErrorCategory {
  switch (type) {
    case CoreErrorType.ConfigurationError:
    case CoreErrorType.ToolNotFound:
      return "configuration";
    case CoreErrorType.PermissionDenied:
    case CoreErrorType.PermissionEscalation:
    case CoreErrorType.PermissionTimeout:
      return "permission";
    case CoreErrorType.InvalidInput:
      return "parse";
    case CoreErrorType.ToolCancelled:
      return "cancelled";
    case CoreErrorType.ToolTimeout:
      return "timeout";
    default:
      return "internal";
  }
}

export async function runToolCallWithTelemetry(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  options: ToolExecuteOptions | undefined,
  execute: (telemetry: ToolExecutionSpanWriter | undefined) => Promise<ToolExecutionResult>,
): Promise<ToolExecutionResult> {
  const scope = deps.agentTelemetry?.startTool({
    registeredToolName: toolCall.name,
    toolCallId: toolCall.id,
  });
  if (!scope) return execute(undefined);
  return scope.run(async () => {
    try {
      return await execute(scope);
    } catch (error) {
      // 业务执行器会在所有正常返回分支按事实收口；这里只负责连 ToolCallStarted/Error
      // 事件发布都直接抛出的非结构化异常，避免 Span 最终只能标记为 missing_terminal。
      if (options?.signal?.aborted) {
        scope.finishCancelled("abort_signal");
      } else {
        scope.finishFailed("unhandled", "unknown", error);
      }
      throw error;
    }
  });
}
