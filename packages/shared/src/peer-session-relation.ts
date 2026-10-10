import { z } from "zod";

/**
 * Host 持久化的创建关系。它是创建者管理与权限决议的唯一授权依据，
 * 不是父子生命周期关系，也不改变用户对目标会话的控制权。
 */
export interface PeerSessionRelation {
  creatorSessionId: string;
  targetSessionId: string;
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  createdBy: "ai";
  createdAt: number;
}

/** 仅在 Host 受信 AI 创建链路中使用的待持久化关系输入。 */
export type PeerSessionCreation = Pick<
  PeerSessionRelation,
  "creatorSessionId" | "remoteSessionId"
>;

export const sessionPermissionDecisionSchema = z.enum(["allow_once", "allow_always", "deny"]);
export type SessionPermissionDecision = z.infer<typeof sessionPermissionDecisionSchema>;

export interface SessionPermissionResolution {
  requestId: string;
  status: "resolved" | "already_resolved";
  decision: SessionPermissionDecision;
}
