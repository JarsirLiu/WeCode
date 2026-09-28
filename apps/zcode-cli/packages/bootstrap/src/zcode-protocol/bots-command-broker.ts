import type { BotsServicePort, TraceContext } from "@zcode/contracts";
import { zcodeBotsCommandExecuteResultSchema, zcodeProtocolMethods } from "@zcode/shared";
import { buildWorkspaceRequestContext } from "./browser-control-broker.js";
import {
  protocolTraceFromTraceContext,
  type ZCodeProtocolAgentServerContext,
  type ZCodeProtocolClientRequestOptions,
} from "./server-types.js";

/**
 * ProtocolBotsCommandBroker —— agent 侧 BotsServicePort 实现。
 *
 * BotCommand 工具的每次调用经此把命令事实变成 ZCode Protocol 的 bots/commandExecute
 * 反向请求，由 host（IBotsCommand 执行桥 → IBotsService）执行并返回结构化结果。
 * botId/channel/workspace 元数据只从受信 session record 读取（与 browser 反向请求
 * 同一构造），模型输入中的替代值没有入口。
 */
export function createProtocolBotsCommandBroker(
  context: ZCodeProtocolAgentServerContext,
): BotsServicePort {
  return {
    async executeBotCommand({ sessionId, turnId, command, action, payload, traceContext, signal }) {
      const result = await context.requestClient(
        zcodeProtocolMethods.botsCommandExecute,
        {
          ...buildWorkspaceRequestContext(context, { sessionId, turnId, traceContext }),
          command: {
            command,
            action,
            ...(payload ? { payload } : {}),
          },
        },
        zcodeBotsCommandExecuteResultSchema,
        buildRequestOptions(traceContext, signal),
      );
      return result;
    },
  };
}

function buildRequestOptions(
  traceContext: TraceContext | undefined,
  signal: AbortSignal | undefined,
): ZCodeProtocolClientRequestOptions {
  return {
    ...(signal ? { signal } : {}),
    ...(traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {}),
  };
}
