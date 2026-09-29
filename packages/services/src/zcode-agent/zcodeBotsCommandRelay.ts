import {
  zcodeBotsCommandExecuteParamsSchema,
  zcodeProtocolMethods,
  type ZCodeProtocolRequest,
} from "@zcode/shared";
import type { ZCodeProtocolClient } from "./zcodeProtocolClient.js";
import type { BotsCommandServiceExecutor } from "./zcodeAgentBotsCommand.js";

type RelayClient = Pick<ZCodeProtocolClient, "respond" | "respondError">;

/**
 * Bot 命令：agent 的 BotCommand 工具经 bots/commandExecute 到达这里。
 * 纯 RPC 中继——转发给 BotsCommandServiceExecutor 执行桥后 respond，不 emitSessionEvent。
 * executor 缺省返回结构化失败（spec: bot-weixin-ai-commands「不得伪装成功」）。
 */
export function handleBotsCommandReverseRequest(args: {
  request: ZCodeProtocolRequest;
  client: RelayClient;
  executor: BotsCommandServiceExecutor | undefined;
}): boolean {
  const { request, client, executor } = args;
  if (request.method !== zcodeProtocolMethods.botsCommandExecute) {
    return false;
  }
  const parsed = zcodeBotsCommandExecuteParamsSchema.safeParse(request.params);
  if (!parsed.success) {
    void client.respondError(request.id, {
      code: -32602,
      message: "Invalid bots/commandExecute params",
      data: parsed.error.flatten(),
    });
    return true;
  }
  if (!executor) {
    void client.respond(request.id, {
      success: false,
      error: "bot command service not available",
    });
    return true;
  }
  void executor
    .execute({
      workspaceKey: parsed.data.workspaceKey,
      workspacePath: parsed.data.workspacePath,
      workspaceIdentity: parsed.data.workspaceIdentity,
      remoteSessionId: parsed.data.remoteSessionId,
      clientMode: parsed.data.clientMode,
      command: {
        command: parsed.data.command.command,
        action: parsed.data.command.action,
        ...(parsed.data.command.payload ? { payload: parsed.data.command.payload } : {}),
      },
    })
    .then((result) => client.respond(request.id, result))
    .catch((error: unknown) => {
      void client.respond(request.id, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  return true;
}
