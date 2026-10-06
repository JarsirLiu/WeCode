import type { ZCodeTaskMeta } from "@zcode/shared";
import type { TaskIndexRepo } from "../session/taskIndexRepo.js";

export interface ResolvedTaskTarget {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

export async function resolveTaskTargetFromHost(
  taskId: string,
  cachedTargets: Map<string, ResolvedTaskTarget>,
  taskIndexRepo: TaskIndexRepo,
  rememberIndexedTaskMeta: (meta: ZCodeTaskMeta) => unknown,
): Promise<ResolvedTaskTarget> {
  const cached = cachedTargets.get(taskId);
  if (cached) return { taskId: cached.taskId, workspacePath: cached.workspacePath, ...(cached.workspaceIdentity ? { workspaceIdentity: cached.workspaceIdentity } : {}) };
  const meta = (await taskIndexRepo.listTaskMetas({})).find((entry) => entry.taskId === taskId);
  if (!meta) throw Object.assign(new Error(`ZCode session target is not loaded: ${taskId}`), { code: "ZCODE_SESSION_TARGET_NOT_FOUND" });
  rememberIndexedTaskMeta(meta);
  return { taskId: meta.taskId, workspacePath: meta.workspacePath, ...(meta.workspaceIdentity ? { workspaceIdentity: meta.workspaceIdentity } : {}) };
}
