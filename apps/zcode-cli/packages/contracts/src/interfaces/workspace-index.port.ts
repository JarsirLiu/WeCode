import type { ZCodeWorkspaceSummary } from "@zcode/shared";
import type { TraceContext } from "../tracing/tracer.js";

export interface WorkspaceIndexRequestContext {
  sessionId: string;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

/** Reads the Host-owned workspace directory without coupling tools to task/session services. */
export interface WorkspaceIndexPort {
  listWorkspaces(context: WorkspaceIndexRequestContext): Promise<ZCodeWorkspaceSummary[]>;
}
