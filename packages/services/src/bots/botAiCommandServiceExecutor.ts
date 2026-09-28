import type { IBotsService } from "./bots.js";
import { getWorkspaceKey } from "./workspaceHelpers.js";
import type { BotsCommandServiceExecutor } from "../zcode-agent/zcodeAgentBotsCommand.js";

// 结构化失败文案常量只在本模块与测试里使用，不导出（knip 不把测试计入消费方）。
const BOTS_COMMAND_SERVICE_UNAVAILABLE_ERROR = "Bot 服务当前不可用";
const BOTS_COMMAND_NO_BOUND_BOT_ERROR = "当前工作区没有绑定的 Bot 会话";
const BOTS_COMMAND_BOT_CONFIG_MISSING_ERROR = "绑定的 Bot 配置不存在或已禁用";

/**
 * Bot 命令的服务侧执行桥：唯一职责是把受信 session 的 workspace 元数据解析成
 * botId/channel，再转发给 IBotsService.executeBotCommand。命令事实与授权仍由
 * botsService 闭包所有；本文件不新增第二份命令路由。
 */
export function createBotsCommandServiceExecutor(deps: {
  readBotsService(): IBotsService | undefined;
}): BotsCommandServiceExecutor {
  return {
    async execute({ workspacePath, workspaceIdentity, command }) {
      const botsService = deps.readBotsService();
      if (!botsService) {
        return { success: false, error: BOTS_COMMAND_SERVICE_UNAVAILABLE_ERROR };
      }
      const targetKey = getWorkspaceKey(workspacePath ?? "", workspaceIdentity);
      if (!targetKey) {
        return { success: false, error: BOTS_COMMAND_NO_BOUND_BOT_ERROR };
      }
      const states = await botsService.getBotStates();
      const state = states.find(
        (candidate) => getWorkspaceKey(candidate.workspacePath, candidate.workspaceIdentity) === targetKey,
      );
      if (!state) {
        return { success: false, error: BOTS_COMMAND_NO_BOUND_BOT_ERROR };
      }
      const config = await botsService.getConfig();
      const bot = config.bots.find((candidate) => candidate.id === state.botId);
      if (!bot) {
        return { success: false, error: BOTS_COMMAND_BOT_CONFIG_MISSING_ERROR };
      }
      try {
        // botId 与 channel 只来自受信 workspace 绑定；模型输入中的替代值到不了这里。
        return await botsService.executeBotCommand({
          ...command,
          botId: state.botId,
          channel: bot.provider,
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
