import { z } from "zod";

/** AI 创建的持久会话在审批控制面中的授权策略。 */
export const peerSessionApprovalPolicySchema = z.enum(["manual", "delegated", "autonomous"]);
export type PeerSessionApprovalPolicy = z.infer<typeof peerSessionApprovalPolicySchema>;

/**
 * Host 持久化的创建关系。它是后续 delegated approval 的唯一授权依据，
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
  approvalPolicy: PeerSessionApprovalPolicy;
  createdAt: number;
}

/** 仅在 Host 受信 AI 创建链路中使用的待持久化关系输入。 */
export type PeerSessionCreation = Pick<
  PeerSessionRelation,
  "creatorSessionId" | "approvalPolicy" | "remoteSessionId"
>;

export const delegatedPermissionDecisionSchema = z.enum(["allow_once", "allow_always", "deny"]);
export type DelegatedPermissionDecision = z.infer<typeof delegatedPermissionDecisionSchema>;

export interface DelegatedPermissionResolution {
  requestId: string;
  status: "resolved" | "already_resolved";
  decision: DelegatedPermissionDecision;
}
