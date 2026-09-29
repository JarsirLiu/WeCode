import type { ZCodeTaskPort, TraceContext } from "@zcode/contracts";
import {
  zcodeProtocolMethods,
  type ZCodeProtocolMethod,
  zcodeTaskCreateTaskResultSchema,
  zcodeTaskGetTaskSnapshotResultSchema,
  zcodeTaskSetModelResultSchema,
  zcodeTaskCompactSessionResultSchema,
  zcodeTaskResumeTaskResultSchema,
  zcodeTaskListTasksResultSchema,
  zcodeTaskSendPromptResultSchema,
  zcodeAiTaskVoidResultSchema,
} from "@zcode/shared";
import { buildWorkspaceRequestContext } from "./browser-control-broker.js";
import {
  protocolTraceFromTraceContext,
  type ParamsSchema,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";

/**
 * ProtocolZCodeTaskBroker —— agent 侧 ZCodeTaskPort 实现。
 *
 * AI 编排工具的每次调用经此变成 ZCode Protocol 的 task/* 反向请求，由 host 的
 * IZCodeTaskService 执行并返回结构化结果。
 *
 * 身份隔离：workspace 路由字段（workspaceKey/workspacePath/workspaceIdentity/
 * remoteSessionId/clientMode）只来自受信 session record，agent 输入中的同名替代值
 * 被覆盖，到不了 host 的 service 层。
 */
export function createProtocolZCodeTaskBroker(
  context: ZCodeProtocolAgentServerContext,
): ZCodeTaskPort {
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
      // sessionId 来自工具参数（ZCodeTaskPort 的会话归属字段），不是 server 闭包：
      // ZCodeProtocolAgentServerContext 没有“当前会话”概念，只有 context.sessions 索引。
      ...buildWorkspaceRequestContext(context, {
        sessionId: params.sessionId,
        traceContext,
      }),
    };
  };

  return {
    createTask: (params) =>
      request(
        zcodeProtocolMethods.taskCreateTask,
        withTrustedContext(params),
        zcodeTaskCreateTaskResultSchema,
        params.traceContext,
        params.signal,
      ),

    sendPrompt: (params) =>
      request(
        zcodeProtocolMethods.taskSendPrompt,
        withTrustedContext(params),
        zcodeTaskSendPromptResultSchema,
        params.traceContext,
        params.signal,
      ),

    stopGeneration: async (params) => {
      await request(
        zcodeProtocolMethods.taskStopGeneration,
        withTrustedContext(params),
        zcodeAiTaskVoidResultSchema,
        params.traceContext,
        params.signal,
      );
    },

    compactSession: (params) =>
      request(
        zcodeProtocolMethods.taskCompactSession,
        withTrustedContext(params),
        zcodeTaskCompactSessionResultSchema,
        params.traceContext,
        params.signal,
      ),

    resumeTask: (params) =>
      request(
        zcodeProtocolMethods.taskResumeTask,
        withTrustedContext(params),
        zcodeTaskResumeTaskResultSchema,
        params.traceContext,
        params.signal,
      ),

    listTasks: (params) =>
      request(
        zcodeProtocolMethods.taskListTasks,
        withTrustedContext(params),
        zcodeTaskListTasksResultSchema,
        params.traceContext,
        params.signal,
      ),

    getTaskSnapshot: (params) =>
      request(
        zcodeProtocolMethods.taskGetTaskSnapshot,
        withTrustedContext(params),
        zcodeTaskGetTaskSnapshotResultSchema,
        params.traceContext,
        params.signal,
      ),

    setModel: (params) =>
      request(
        zcodeProtocolMethods.taskSetModel,
        withTrustedContext(params),
        zcodeTaskSetModelResultSchema,
        params.traceContext,
        params.signal,
      ),
  };
}
