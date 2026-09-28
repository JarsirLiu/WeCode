import type { BotAiCommandParams, BotAiCommandResult } from "../bots/botAiCommandPolicy.js";

/**
 * BotsCommandServiceExecutor —— host 侧 Bot 命令执行桥。
 *
 * agent 的 bots/commandExecute 反向请求经 zcodeAgentService 到达这里；实现方
 * （createLocalServices 装配的 createBotsCommandServiceExecutor）负责把受信 session 的
 * workspace 元数据解析成 botId/channel，再交给 IBotsService.executeBotCommand。
 * 缺省（纯 CLI / 未装配）由 zcodeAgentService 返回结构化失败，不伪造成功。
 */
export interface BotsCommandServiceExecutor {
  execute(input: {
    workspaceKey?: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: string;
    command: Pick<BotAiCommandParams, "command" | "action" | "payload">;
  }): Promise<BotAiCommandResult>;
}
