import {
  zcodePermissionRequestedEventPayloadSchema,
  zcodeTurnCompletedEventPayloadSchema,
  zcodeTurnFailedEventPayloadSchema,
  type ZCodeSessionEvent,
} from "@zcode/shared";

export type PeerSessionChange = {
  kind:
    | "permission_requested"
    | "turn_completed"
    | "turn_failed"
    | "generation_stopped";
  turnId?: string;
  requestId?: string;
  summary?: string;
  error?: { code?: string; message: string };
};

/** 只从 runtime 权威 session/event 生成唤醒原因；state.updated 不参与推导。 */
export function toPeerSessionChange(event: ZCodeSessionEvent): PeerSessionChange | null {
  if (event.type === "permission.requested") {
    const payload = zcodePermissionRequestedEventPayloadSchema.safeParse(event.payload);
    if (!payload.success || !payload.data.requestId) return null;
    return {
      kind: "permission_requested",
      ...(event.turnId ? { turnId: event.turnId } : {}),
      requestId: payload.data.requestId,
      summary: payload.data.reason,
    };
  }
  if (event.type === "turn.completed") {
    const payload = zcodeTurnCompletedEventPayloadSchema.safeParse(event.payload);
    if (!payload.success) return null;
    if (payload.data.resultType === "cancelled") {
      return {
        kind: "generation_stopped",
        ...(event.turnId ? { turnId: event.turnId } : {}),
        summary: "目标会话已停止生成",
      };
    }
    return {
      kind: "turn_completed",
      ...(event.turnId ? { turnId: event.turnId } : {}),
      summary: payload.data.response,
    };
  }
  if (event.type === "turn.failed") {
    const payload = zcodeTurnFailedEventPayloadSchema.safeParse(event.payload);
    if (!payload.success) return null;
    return {
      kind: "turn_failed",
      ...(event.turnId ? { turnId: event.turnId } : {}),
      error: {
        ...(payload.data.error.code ? { code: payload.data.error.code } : {}),
        message: payload.data.error.message,
      },
    };
  }
  return null;
}
