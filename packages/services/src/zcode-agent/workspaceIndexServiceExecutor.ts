import type { ZCodeWorkspaceSummary } from "@zcode/shared";

export interface WorkspaceIndexServiceExecutor {
  listWorkspaces(): Promise<ZCodeWorkspaceSummary[]>;
}
