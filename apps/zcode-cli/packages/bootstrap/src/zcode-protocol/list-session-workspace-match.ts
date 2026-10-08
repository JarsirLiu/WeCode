import { isRemoteWorkspaceIdentity } from "@zcode/shared";
import type { SessionInfo } from "@zcode/contracts";

/**
 * 本地旧会话可能只有 directory/path，没有写入 workspace_id；本地 workspace 的稳定身份键
 * 本身就是 workspacePath，因此允许按路径回退。远程 workspace 的 identity 携带连接边界，
 * 必须严格按 workspace_id 匹配，不能用相同路径跨连接认领会话。
 */
export function matchesListedWorkspace(
  session: SessionInfo,
  workspace: { workspacePath?: string; workspaceIdentity?: string },
): boolean {
  const identity = workspace.workspaceIdentity?.trim();
  if (identity && isRemoteWorkspaceIdentity(identity)) {
    return session.workspaceID?.trim() === identity;
  }

  const path = workspace.workspacePath;
  const storedIdentity = session.workspaceID?.trim();
  return (
    (storedIdentity || session.path || session.directory) === (identity || path) ||
    (path !== undefined && (session.path === path || session.directory === path))
  );
}
