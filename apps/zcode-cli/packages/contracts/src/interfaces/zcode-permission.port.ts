import type { TraceContext } from "../tracing/tracer.js";
import type { SessionPermissionDecision, SessionPermissionResolution } from "@zcode/shared";

/** Host-owned delegated permission boundary; the agent never receives a direct runtime handle. */
export interface ZCodePermissionPort {
  resolveSessionPermission(params: {
    targetSessionId: string;
    requestId: string;
    decision: SessionPermissionDecision;
    reason?: string;
    sessionId: string;
    traceContext?: TraceContext;
    signal?: AbortSignal;
  }): Promise<SessionPermissionResolution>;
}
