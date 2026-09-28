import type { ZCodeSessionPort, TraceContext } from "@zcode/contracts";
import {
  zcodeProtocolMethods,
  type ZCodeProtocolMethod,
  zcodeSessionReadSessionResultSchema,
  zcodeSessionListSessionsResultSchema,
} from "@zcode/shared";
import { buildWorkspaceRequestContext } from "./browser-control-broker.js";
import {
  protocolTraceFromTraceContext,
  type ParamsSchema,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";

/**
 * ProtocolZCodeSessionBroker —— agent 侧 ZCodeSessionPort 实现。
 *
 * AI 编排工具的只读调用经此变成 ZCode Protocol 的 session/* 反向请求，由 host 的
 * IZCodeSessionService 执行。写操作（创建、换模型、换模式）走 ZCodeTaskPort，
 * 因为含 task 索引管理（spec: docs/specs/ai-session-orchestration.md）。
 */
export function createProtocolZCodeSessionBroker(
  context: ZCodeProtocolAgentServerContext,
): ZCodeSessionPort {
  const request = <T>(
    method: ZCodeProtocolMethod,
    params: unknown,
    resultSchema: ParamsSchema<T>,
    traceContext?: TraceContext,
    signal?: AbortSignal,
  ): Promise<T> =>
    context.requestClient(
      method,
      params,
      resultSchema,
      {
        ...(signal ? { signal } : {}),
        ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
      } as ZCodeProtocolClientRequestOptions,
    );

  /** agent 操作字段 + 受信 workspace 上下文；后者覆盖前者中的同名路由字段。 */
  const withTrustedContext = <
    T extends {
      sessionId: string;
      traceContext?: TraceContext;
      signal?: AbortSignal;
    },
  >(params: T) => {
    const { traceContext, signal: _signal, ...operation } = params;
    return {
      ...operation,
      // sessionId 直接来自工具参数：readSession 读的是目标会话，必须用目标会话的
      // workspace 解析路由，用调用方会话会把请求投到自己的工作区。
      // requireSession 只查 context.sessions（本 runtime 内活跃会话），因此跨工作区
      // 会话天然不可达，不构成越权读。
      ...buildWorkspaceRequestContext(context, {
        sessionId: params.sessionId,
        traceContext,
      }),
    };
  };

  return {
    // readSession 用 targetSessionId 解析目标会话的 workspace 路由（不是调用方）。
    // requireSession 只查 context.sessions（本 runtime 内活跃会话），跨工作区
    // 会话天然不可达，不构成越权读。不用 withTrustedContext——后者取 params.sessionId
    // （调用方），会把请求投到调用方自己的工作区。
    readSession: (params) => {
      const { traceContext, signal, targetSessionId, messageLimit, afterSeq } = params;
      return request(
        zcodeProtocolMethods.sessionReadSession,
        {
          ...buildWorkspaceRequestContext(context, {
            sessionId: targetSessionId,
            traceContext,
          }),
          targetSessionId,
          ...(messageLimit !== undefined ? { messageLimit } : {}),
          ...(afterSeq !== undefined ? { afterSeq } : {}),
        },
        zcodeSessionReadSessionResultSchema,
        traceContext,
        signal,
      );
    },

    listSessions: (params) =>
      request(
        zcodeProtocolMethods.sessionListSessions,
        withTrustedContext(params),
        zcodeSessionListSessionsResultSchema,
        params.traceContext,
        params.signal,
      ),
  };
}
