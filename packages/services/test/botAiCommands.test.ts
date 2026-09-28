import assert from "node:assert/strict";
import test from "node:test";
import type {
  BotAiAuthorizedContext,
  BotAiCommandDeps,
} from "../src/bots/botAiCommandPolicy.js";
import { createBotAiCommandExecutor } from "../src/bots/botAiCommands.js";
import {
  buildTextGuidance,
  getBotChannelCapabilities,
  isBotAiCommandSupported,
} from "../src/bots/botAiCommandPolicy.js";

const noopAuth: BotAiAuthorizedContext = {
  bot: { id: "bot-1", provider: "weixin" } as BotAiAuthorizedContext["bot"],
  user: { id: "user-1" } as BotAiAuthorizedContext["user"],
  context: {
    botId: "bot-1",
    workspacePath: "/tmp/demo",
    workspaceId: "local:/tmp/demo",
    mode: "draft",
    updatedAt: 0,
  } as BotAiAuthorizedContext["context"],
  locale: undefined,
};

function createStubDeps(overrides: Partial<BotAiCommandDeps> = {}): BotAiCommandDeps {
  return {
    resolveAuthorizedContext: async () => ({ ok: true, auth: noopAuth }),
    isContextActiveTaskRunning: async () => false,
    messages: {
      taskRunning: () => "task running",
      workspaceMissing: () => "workspace missing",
      modelProviderMissing: () => "provider missing",
      modelMissing: () => "model missing",
      taskMissing: () => "task missing",
      noHistoryTasks: () => "no history tasks",
      noActiveTask: () => "no active task",
      thoughtLevelMissing: () => "thought level missing",
      replyMissing: () => "reply missing",
    },
    listWorkspaceOptions: async () => [
      { id: "ws-1", label: "demo" },
      { id: "ws-2", label: "remote" },
    ],
    applyWorkspaceSelection: async () => ({ ok: true }),
    listModelProviderOptions: async () => [
      {
        id: "anthropic",
        label: "Anthropic",
        models: [{ id: "anthropic/claude", label: "claude" }],
      },
    ],
    listModelOptionsForProvider: async () => [{ id: "anthropic/claude", label: "claude" }],
    readCurrentModelLabel: async () => "Anthropic/claude",
    applyModelSelection: async () => ({ ok: true }),
    listTaskOptions: async () => [{ id: "task-1", label: "refactor" }],
    readCurrentTaskLabel: async () => "refactor",
    applyTaskSelection: async () => ({ ok: true }),
    createTaskDraft: async () => ({ ok: true }),
    stopActiveTask: async () => ({ ok: true }),
    getStatusSummary: async () => "status text",
    reconnectRemoteWorkspace: async () => ({ ok: true, statusText: "reconnected" }),
    listThoughtLevelOptions: async () => [{ id: "high", label: "High" }],
    readCurrentThoughtLevelLabel: async () => "High",
    applyThoughtLevel: async () => ({ ok: true }),
    listReplyOptions: async () => [{ id: "summary_changes", label: "Summary" }],
    readCurrentReplyLabel: async () => "Summary",
    applyReplyMode: async () => ({ ok: true }),
    ...overrides,
  };
}

test("channel capabilities keep weixin text-only", () => {
  const weixin = getBotChannelCapabilities("weixin");
  assert.equal(weixin.supportsStructuredSelection, false);
  assert.equal(weixin.supportsMarkdown, false);
  assert.equal(weixin.maxMessageLength, 2048);

  for (const channel of ["feishu", "lark", "telegram"] as const) {
    const caps = getBotChannelCapabilities(channel);
    assert.equal(caps.supportsStructuredSelection, true);
  }
});

test("mode is rejected on every channel and reply is channel gated", () => {
  for (const channel of ["weixin", "feishu", "telegram", "webhook"] as const) {
    assert.equal(isBotAiCommandSupported("mode", channel), false);
  }
  assert.equal(isBotAiCommandSupported("reply", "weixin"), false);
  assert.equal(isBotAiCommandSupported("reply", "telegram"), true);
  assert.equal(isBotAiCommandSupported("model", "weixin"), true);
});

test("text guidance numbers options and shows current value", () => {
  const guidance = buildTextGuidance(
    "请选择工作区",
    [
      { id: "ws-1", label: "demo" },
      { id: "ws-2", label: "remote" },
    ],
    "/tmp/demo",
  );
  assert.match(guidance, /当前: \/tmp\/demo/);
  assert.match(guidance, /1\. demo/);
  assert.match(guidance, /2\. remote/);
  assert.match(guidance, /请回复数字选择/);
});

test("executor rejects unsupported commands without touching auth", async () => {
  let authCalls = 0;
  const executor = createBotAiCommandExecutor(
    createStubDeps({
      resolveAuthorizedContext: async () => {
        authCalls += 1;
        return { ok: true, auth: noopAuth };
      },
    }),
  );
  const modeResult = await executor({
    command: "mode",
    action: "set",
    botId: "bot-1",
    channel: "feishu",
  });
  assert.equal(modeResult.success, false);
  assert.match(modeResult.error ?? "", /yolo/);
  assert.equal(authCalls, 0);

  const replyResult = await executor({
    command: "reply",
    action: "list",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(replyResult.success, false);
  assert.equal(authCalls, 0);
});

test("status and reconnect execute directly and return message text", async () => {
  const executor = createBotAiCommandExecutor(createStubDeps());
  const status = await executor({
    command: "status",
    action: "execute",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(status.success, true);
  assert.equal(status.message, "status text");

  const reconnect = await executor({
    command: "reconnect",
    action: "execute",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(reconnect.success, true);
  assert.equal(reconnect.message, "reconnected");
});

test("model flow returns text guidance on weixin and structured options on telegram", async () => {
  const executor = createBotAiCommandExecutor(createStubDeps());
  const weixinList = await executor({
    command: "model",
    action: "list",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(weixinList.success, true);
  assert.equal(weixinList.step, "select_provider");
  assert.ok(weixinList.options?.length === 1);
  assert.match(weixinList.textGuidance ?? "", /1\. Anthropic/);

  const telegramList = await executor({
    command: "model",
    action: "list",
    botId: "bot-1",
    channel: "telegram",
  });
  assert.equal(telegramList.success, true);
  assert.equal(telegramList.textGuidance, undefined);
  assert.ok(telegramList.options?.length === 1);

  const providerStep = await executor({
    command: "model",
    action: "set",
    payload: { providerId: "anthropic" },
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(providerStep.step, "select_model");

  const doneStep = await executor({
    command: "model",
    action: "set",
    payload: { modelId: "anthropic/claude" },
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(doneStep.success, true);
  assert.equal(doneStep.step, "done");
  assert.equal(doneStep.message, "Anthropic/claude");
});

test("running task blocks selection commands with localized error", async () => {
  const executor = createBotAiCommandExecutor(
    createStubDeps({ isContextActiveTaskRunning: async () => true }),
  );
  const result = await executor({
    command: "workspace",
    action: "list",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "task running");
});

test("resolution failure short-circuits with error", async () => {
  const executor = createBotAiCommandExecutor(
    createStubDeps({
      resolveAuthorizedContext: async () => ({ ok: false, error: "user not bound" }),
    }),
  );
  const result = await executor({
    command: "model",
    action: "list",
    botId: "bot-1",
    channel: "weixin",
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "user not bound");
});
