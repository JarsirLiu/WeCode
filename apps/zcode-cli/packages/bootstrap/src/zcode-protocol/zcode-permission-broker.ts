import type { ZCodePermissionPort, TraceContext } from "@zcode/contracts";
import { zcodePermissionResolveSessionPermissionResultSchema, zcodeProtocolMethods, type ZCodeProtocolMethod } from "@zcode/shared";
import { buildWorkspaceRequestContext } from "./browser-control-broker.js";
import { protocolTraceFromTraceContext, type ZCodeProtocolAgentServerContext, type ZCodeProtocolClientRequestOptions } from "./server-types.js";

export function createProtocolZCodePermissionBroker(context: ZCodeProtocolAgentServerContext): ZCodePermissionPort {
  return {
    resolveSessionPermission: ({ sessionId, targetSessionId, requestId, decision, reason, traceContext, signal }) =>
      context.requestClient(zcodeProtocolMethods.permissionResolveSessionPermission as ZCodeProtocolMethod, {
        targetSessionId, permissionRequestId: requestId, decision, ...(reason ? { reason } : {}),
        ...buildWorkspaceRequestContext(context, { sessionId, traceContext }),
      }, zcodePermissionResolveSessionPermissionResultSchema, {
        ...(signal ? { signal } : {}),
        ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
      } as ZCodeProtocolClientRequestOptions),
  };
}
