import assert from "node:assert/strict";
import test from "node:test";
import { zcodeSessionEventSchema } from "@zcode/shared";
import { toPeerSessionChange } from "../src/zcode-agent/peerSessionChangeEvent.js";

function event(type: string, payload: unknown, turnId = "turn-1") {
  return zcodeSessionEventSchema.parse({
    eventId: `${type}-${turnId}`,
    sessionId: "target-session",
    turnId,
    seq: 7,
    timestamp: 1,
    type,
    payload,
  });
}

test("peer wakeup mapping only accepts explicit runtime event facts", () => {
  assert.deepEqual(
    toPeerSessionChange(
      event("permission.requested", {
        requestId: "permission-1",
        toolCallId: "tool-1",
        toolName: "shell",
        riskLevel: "high",
        reason: "需要批准 shell 命令",
        input: { command: "pnpm test" },
        options: [
          {
            optionId: "allow-once",
            kind: "allow",
            name: "允许一次",
            response: { decision: "allow" },
          },
        ],
      }),
    ),
    {
      kind: "permission_requested",
      turnId: "turn-1",
      requestId: "permission-1",
      summary: "需要批准 shell 命令",
    },
  );

  assert.equal(
    toPeerSessionChange(
      event("permission.requested", {
        toolCallId: "tool-2",
        toolName: "shell",
        riskLevel: "high",
        reason: "缺少 request id",
        input: {},
        options: [
          {
            optionId: "deny",
            kind: "deny",
            name: "拒绝",
            response: { decision: "deny" },
          },
        ],
      }),
    ),
    null,
  );

  assert.deepEqual(
    toPeerSessionChange(
      event("turn.completed", {
        response: "已完成",
        tokenCount: 2,
        toolCallCount: 1,
        duration: 10,
        resultType: "success",
      }),
    ),
    { kind: "turn_completed", turnId: "turn-1", summary: "已完成" },
  );
  assert.deepEqual(
    toPeerSessionChange(
      event("turn.completed", {
        response: "",
        tokenCount: 0,
        toolCallCount: 0,
        duration: 1,
        resultType: "cancelled",
      }),
    ),
    { kind: "generation_stopped", turnId: "turn-1", summary: "目标会话已停止生成" },
  );
  assert.deepEqual(
    toPeerSessionChange(
      event("turn.failed", {
        error: { type: "provider_error", message: "模型失败", code: "provider_error" },
        turnPhase: "generation",
      }),
    ),
    {
      kind: "turn_failed",
      turnId: "turn-1",
      error: { code: "provider_error", message: "模型失败" },
    },
  );
});

test("non-terminal runtime events are not guessed into peer wakeups", () => {
  assert.equal(
    toPeerSessionChange(event("session.updated", { status: "waiting", reason: "permission" })),
    null,
  );
});
