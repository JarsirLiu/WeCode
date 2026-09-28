// ============================================================
// ZCodeSessionPort - AI Runtime 调用 ZCode Session API 的端口
// ============================================================
//
// 与 IZCodeSessionService 对应（packages/services/src/zcode-session/zcodeSession.ts）。
// Host 侧由 IZCodeSessionService 实现；本文件只做结构镜像，避免跨包依赖。
//
// 范围约束（spec: docs/specs/ai-session-orchestration.md）：只读查询走本端口；
// 创建、换模型、换模式等写操作走 ZCodeTaskPort（含 task 索引管理）。workspace
// 生命周期方法不进 AI 工具面，由 Host 侧自行管理。

import type { TraceContext } from "../tracing/tracer.js";
import type {
  ZCodeSessionStateSnapshot,
  ZCodeSessionInfo,
  ZCodeDeliveryKind,
} from "@zcode/shared";

/**
 * 尾部字段同 ZCodeTaskPortRequestContext。sessionId 由调用方从 ToolExecutionContext
 * 传入（readSession 传目标会话 id），broker 用它解析受信 session record。
 */
export interface ZCodeSessionPortRequestContext {
  sessionId: string;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

export interface ZCodeSessionPort {
  /** 列出会话 */
  listSessions(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    includeArchived?: boolean;
    limit?: number;
  } & ZCodeSessionPortRequestContext): Promise<ZCodeSessionInfo[]>;

  /** 读取会话状态。targetSessionId 是要读的目标会话，与 RequestContext.sessionId（调用方）区分，避免碰撞。 */
  readSession(params: {
    targetSessionId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    deliveryKind?: ZCodeDeliveryKind;
    messageLimit?: number;
    afterSeq?: number;
  } & ZCodeSessionPortRequestContext): Promise<ZCodeSessionStateSnapshot>;
}
