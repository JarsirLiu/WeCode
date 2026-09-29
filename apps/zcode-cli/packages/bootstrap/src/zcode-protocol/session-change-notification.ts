import {
  ZCODE_SESSION_CHANGED_NOTIFICATION,
  zcodeSessionChangedNotificationSchema,
} from "@zcode/shared";
import type { ZCodeProtocolAgentServerContext } from "./server-types.js";
import type { TraceContext } from "@zcode/contracts";

type ResidentRuntime = {
  enqueueBackgroundTaskNotification(input: { text: string; traceContext: TraceContext }): void;
};

/** 将 Host 的显式 peer 通知交给 resident creator runtime；不负责启动或排队。 */
export function handleSessionChangedNotification(
  context: ZCodeProtocolAgentServerContext,
  method: string,
  params: unknown,
): boolean {
  if (method !== ZCODE_SESSION_CHANGED_NOTIFICATION || params === undefined) return false;
  const parsed = zcodeSessionChangedNotificationSchema.safeParse(params);
  if (!parsed.success) return false;
  const creator = context.sessions.get(parsed.data.creatorSessionId);
  if (!creator || creator.app.sessionId !== parsed.data.creatorSessionId) return false;
  const runtime = creator.app.runtime as unknown as Partial<ResidentRuntime> | undefined;
  if (typeof runtime?.enqueueBackgroundTaskNotification !== "function") return false;
  runtime.enqueueBackgroundTaskNotification({
    text: JSON.stringify({ method: ZCODE_SESSION_CHANGED_NOTIFICATION, params: parsed.data }),
    traceContext: creator.traceContext,
  });
  return true;
}
