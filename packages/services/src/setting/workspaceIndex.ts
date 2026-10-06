import type { AppSettings } from "@zcode/shared";
import type { WorkspaceSummary } from "./setting.js";

export function buildWorkspaceSummaries(
  settings: Pick<AppSettings, "lastWorkspaceSession" | "recentProjects">,
): WorkspaceSummary[] {
  const result: WorkspaceSummary[] = [];
  const seen = new Set<string>();
  const add = (workspace: WorkspaceSummary): void => {
    const path = workspace.workspacePath.trim();
    if (!path) return;
    const identity = workspace.workspaceIdentity?.trim() || path;
    if (seen.has(identity)) return;
    seen.add(identity);
    result.push({
      ...workspace,
      workspacePath: path,
      ...(workspace.workspaceIdentity?.trim()
        ? { workspaceIdentity: workspace.workspaceIdentity.trim() }
        : {}),
    });
  };

  for (const entry of settings.lastWorkspaceSession ?? []) {
    const workspacePath = entry.workspacePath.trim();
    const label = workspacePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? workspacePath;
    add({
      kind: entry.kind,
      workspacePath,
      ...(entry.kind === "remote" && entry.workspaceIdentity
        ? { workspaceIdentity: entry.workspaceIdentity }
        : {}),
      label,
      ...(entry.kind === "local" && entry.workspacePurpose
        ? { workspacePurpose: entry.workspacePurpose }
        : {}),
      ...(entry.kind === "remote" ? { lastConnectionStatus: entry.lastConnectionStatus } : {}),
    });
  }
  for (const workspacePath of settings.recentProjects ?? []) {
    const label = workspacePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? workspacePath;
    add({ kind: "local", workspacePath, label, workspacePurpose: "project" });
  }
  return result;
}
