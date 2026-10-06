import type { WorkspaceIndexPort } from "@zcode/contracts";
import { zcodeProtocolMethods, zcodeWorkspaceListResultSchema } from "@zcode/shared";
import { buildWorkspaceRequestContext } from "./browser-control-broker.js";
import {
  protocolTraceFromTraceContext,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";

export function createProtocolWorkspaceIndexBroker(
  context: ZCodeProtocolAgentServerContext,
): WorkspaceIndexPort {
  return {
    listWorkspaces: async ({ sessionId, traceContext, signal }) =>
      context.requestClient(
        zcodeProtocolMethods.workspaceList,
        buildWorkspaceRequestContext(context, { sessionId, traceContext }),
        zcodeWorkspaceListResultSchema,
        {
          ...(signal ? { signal } : {}),
          ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
        } as ZCodeProtocolClientRequestOptions,
      ),
  };
}
