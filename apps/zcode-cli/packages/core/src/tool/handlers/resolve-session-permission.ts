import {
  CoreErrorType, createCoreError, RESOLVE_SESSION_PERMISSION_DESCRIPTION,
  RESOLVE_SESSION_PERMISSION_TOOL_NAME, ResolveSessionPermissionInputJsonSchema,
  ResolveSessionPermissionInputSchema, ResolveSessionPermissionOutputJsonSchema,
  ResolveSessionPermissionOutputSchema,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

const handler: ToolHandler = async (input, context) => {
  const parsed = ResolveSessionPermissionInputSchema.safeParse(input);
  if (!parsed.success) throw createCoreError(CoreErrorType.ToolExecutionFailed, "Invalid ResolveSessionPermission input", { recoverable: true });
  if (!context.zcodePermissionPort) throw createCoreError(CoreErrorType.ToolExecutionFailed, "ZCode permission service is not available in this session", { recoverable: true });
  return context.zcodePermissionPort.resolveSessionPermission({
    targetSessionId: parsed.data.sessionId, requestId: parsed.data.requestId, decision: parsed.data.decision,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}), sessionId: context.sessionId,
    traceContext: context.traceContext, signal: context.abortSignal,
  });
};

export const resolveSessionPermissionToolEntry: ToolEntry = {
  capability: "Resolve a delegated peer session permission", metadata: { name: RESOLVE_SESSION_PERMISSION_TOOL_NAME, description: RESOLVE_SESSION_PERMISSION_DESCRIPTION, readOnly: false, destructive: false, concurrentSafe: false, timeoutMs: 30000, maxOutputBytes: 10000, sideEffectScope: "workspace", riskLevel: "high", needsApproval: false },
  handler, inputSchema: ResolveSessionPermissionInputJsonSchema, outputSchema: ResolveSessionPermissionOutputJsonSchema,
  runtimeInputSchema: ResolveSessionPermissionInputSchema, runtimeOutputSchema: ResolveSessionPermissionOutputSchema,
  permission: { permission: "zcode.permission.resolve", reason: "ResolveSessionPermission resolves a peer session permission", riskLevel: "high", sideEffectScope: "workspace", needsApproval: false, patternSources: ["toolName"], alwaysAllowPatternSources: ["toolName"], denyPriority: "beforeAsk" },
  resultBudget: { maxInlineBytes: 10000, maxModelBytes: 10000, strategy: "truncate", preview: { maxBytes: 10000, direction: "head" } },
  timeout: { defaultMs: 30000, maxMs: 30000, allowCallOverride: false }, cancellation: { supported: true, cleanup: "none", userVisibleMessage: "Permission resolution was cancelled before the host confirmed it" }, trace: { required: true, propagateToAdapters: false, recordInput: "summary", recordOutput: "summary" },
};
