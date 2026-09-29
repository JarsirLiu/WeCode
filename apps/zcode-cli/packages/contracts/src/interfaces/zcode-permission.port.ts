import type { TraceContext } from "../tracing/tracer.js";
import type { DelegatedPermissionDecision, DelegatedPermissionResolution } from "@zcode/shared";

/** Host-owned delegated permission boundary; the agent never receives a direct runtime handle. */
export interface ZCodePermissionPort {
  resolveSessionPermission(params: {
    targetSessionId: string;
    requestId: string;
    decision: DelegatedPermissionDecision;
    reason?: string;
    sessionId: string;
    traceContext?: TraceContext;
    signal?: AbortSignal;
  }): Promise<DelegatedPermissionResolution>;
}
