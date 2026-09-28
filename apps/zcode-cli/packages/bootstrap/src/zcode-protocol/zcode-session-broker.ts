import type { ZCodeSessionPort, TraceContext } from "@zcode/contracts";
import { zcodeSessionTypes } from "@zcode/shared";
import {
  buildWorkspaceRequestContext,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";
import { zcodeProtocolMethods } from "@zcode/shared";

/**
 * ProtocolZCodeSessionBroker —— agent 侧 ZCodeSessionPort 实现。
 *
 * ZCode Session 工具的每次调用经此把命令事实变成 ZCode Protocol 的 session/* 反向请求，
 * 由 host 的 IZCodeSessionService 执行并返回结构化结果。
 * workspace 元数据只从受信 session record 读取，模型输入中的替代值没有入口。
 */
export function createProtocolZCodeSessionBroker(
  context: ZCodeProtocolAgentServerContext,
): ZCodeSessionPort {
  const request = async <T>(
    method: string,
    params: unknown,
    resultSchema: any,
    traceContext?: TraceContext,
    signal?: AbortSignal,
  ): Promise<T> => {
    return context.requestClient(
      method as any,
      params,
      resultSchema,
      {
        ...(signal ? { signal } : {}),
        ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
      } as ZCodeProtocolClientRequestOptions,
    );
  };

  return {
    // ---- Workspace ----
    initializeWorkspace: (params) => request(
      "session/initializeWorkspace",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.initializeWorkspaceResultSchema,
    ),
    getWorkspaceRuntimeIdentity: (params) => request(
      "session/getWorkspaceRuntimeIdentity",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.getWorkspaceRuntimeIdentityResultSchema,
    ),
    readWorkspacePresentation: (params) => request(
      "session/readWorkspacePresentation",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.readWorkspacePresentationResultSchema,
    ),

    // ---- Session 生命周期 ----
    createSession: (params) => request(
      "session/createSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.createSessionResultSchema,
    ),
    resumeSession: (params) => request(
      "session/resumeSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.resumeSessionResultSchema,
    ),
    listSessions: (params) => request(
      "session/listSessions",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.listSessionsResultSchema,
    ),
    readSession: (params) => request(
      "session/readSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.readSessionResultSchema,
    ),
    readSessionMessages: (params) => request(
      "session/readSessionMessages",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.readSessionMessagesResultSchema,
    ),
    readSessionEvents: (params) => request(
      "session/readSessionEvents",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.readSessionEventsResultSchema,
    ),
    promoteDeferredDraftSession: (params) => request(
      "session/promoteDeferredDraftSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.promoteDeferredDraftSessionResultSchema,
    ),
    closeSession: (params) => request(
      "session/closeSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.closeSessionResultSchema,
    ),
    closeDeferredDraftSession: (params) => request(
      "session/closeDeferredDraftSession",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.closeDeferredDraftSessionResultSchema,
    ),

    // ---- 配置 ----
    setModel: (params) => request(
      "session/setModel",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.setModelResultSchema,
    ),
    setThoughtLevel: (params) => request(
      "session/setThoughtLevel",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.setThoughtLevelResultSchema,
    ),
    setMode: (params) => request(
      "session/setMode",
      buildWorkspaceRequestContext(context, { sessionId: context.sessionId, traceContext: params as any }),
      zcodeSessionTypes.setModeResultSchema,
    ),
  };
}

function protocolTraceFromTraceContext(traceContext: TraceContext): any {
  return {
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    parentSpanId: traceContext.parentSpanId,
    ...(traceContext.attributes ? { attributes: traceContext.attributes } : {}),
  };
}