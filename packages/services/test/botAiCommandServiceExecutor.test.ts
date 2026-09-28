import assert from "node:assert/strict";
import test from "node:test";
import type { IBotsService } from "../src/bots/bots.js";
import { createBotsCommandServiceExecutor } from "../src/bots/botAiCommandServiceExecutor.js";

const BOTS_COMMAND_SERVICE_UNAVAILABLE_ERROR = "Bot 服务当前不可用";
const BOTS_COMMAND_NO_BOUND_BOT_ERROR = "当前工作区没有绑定的 Bot 会话";
const BOTS_COMMAND_BOT_CONFIG_MISSING_ERROR = "绑定的 Bot 配置不存在或已禁用";

function createStubBotsService(
  overrides: Partial<Pick<IBotsService, "getBotStates" | "getConfig" | "executeBotCommand">> = {},
): IBotsService {
  return {
    getBotStates: async () => [
      {
        botId: "bot-1",
        workspacePath: "/tmp/demo",
        workspaceId: "local:/tmp/demo",
        mode: "draft",
        activeTaskId: null,
        updatedAt: 0,
      },
      {
        botId: "bot-2",
        workspacePath: "/tmp/remote-demo",
        workspaceIdentity: "remote:ssh:host:/tmp/remote-demo",
        mode: "task",
        activeTaskId: "task-1",
        updatedAt: 0,
      },
    ],
    getConfig: async () =>
      ({
        version: 3,
        bots: [
          { id: "bot-1", provider: "weixin" },
          { id: "bot-2", provider: "feishu" },
        ],
      }) as Awaited<ReturnType<IBotsService["getConfig"]>>,
    executeBotCommand: async (input) => ({
      success: true,
      step: "done",
      message: `${input.botId}:${input.channel}:${input.command}`,
    }),
    ...overrides,
  } as unknown as IBotsService;
}

test("resolves botId and channel from the session workspace identity", async () => {
  const calls: string[] = [];
  const botsService = createStubBotsService({
    executeBotCommand: async (input) => {
      calls.push(`${input.botId}:${input.channel}`);
      return { success: true, step: "done" };
    },
  });
  const executor = createBotsCommandServiceExecutor({ readBotsService: () => botsService });

  const local = await executor.execute({
    workspacePath: "/tmp/demo",
    command: { command: "status", action: "execute" },
  });
  assert.deepEqual(local, { success: true, step: "done" });
  assert.deepEqual(calls, ["bot-1:weixin"]);

  const remote = await executor.execute({
    workspacePath: "/tmp/other-path",
    workspaceIdentity: "remote:ssh:host:/tmp/remote-demo",
    command: { command: "stop", action: "execute" },
  });
  assert.equal(remote.success, true);
  assert.deepEqual(calls, ["bot-1:weixin", "bot-2:feishu"]);
});

test("returns structured failure when service, workspace or bot config is missing", async () => {
  const executorWithoutService = createBotsCommandServiceExecutor({ readBotsService: () => undefined });
  const missingService = await executorWithoutService.execute({
    workspacePath: "/tmp/demo",
    command: { command: "status", action: "execute" },
  });
  assert.deepEqual(missingService, { success: false, error: BOTS_COMMAND_SERVICE_UNAVAILABLE_ERROR });

  const executor = createBotsCommandServiceExecutor({
    readBotsService: () => createStubBotsService(),
  });
  const missingWorkspace = await executor.execute({
    workspacePath: "/tmp/unknown",
    command: { command: "status", action: "execute" },
  });
  assert.deepEqual(missingWorkspace, { success: false, error: BOTS_COMMAND_NO_BOUND_BOT_ERROR });

  const missingConfig = createBotsCommandServiceExecutor({
    readBotsService: () =>
      createStubBotsService({
        getConfig: async () => ({ version: 3, bots: [] }) as Awaited<ReturnType<IBotsService["getConfig"]>>,
      }),
  });
  const noBot = await missingConfig.execute({
    workspacePath: "/tmp/demo",
    command: { command: "status", action: "execute" },
  });
  assert.deepEqual(noBot, { success: false, error: BOTS_COMMAND_BOT_CONFIG_MISSING_ERROR });
});

test("executeBotCommand rejections become structured failures, not thrown errors", async () => {
  const executor = createBotsCommandServiceExecutor({
    readBotsService: () =>
      createStubBotsService({
        executeBotCommand: async () => {
          throw new Error("workspace out of scope");
        },
      }),
  });
  const result = await executor.execute({
    workspacePath: "/tmp/demo",
    command: { command: "model", action: "list" },
  });
  assert.deepEqual(result, { success: false, error: "workspace out of scope" });
});
