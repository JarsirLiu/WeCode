import assert from "node:assert/strict";
import test from "node:test";
import { zcodeProtocolMethods, type ZCodeProtocolRequest } from "@zcode/shared";
import { handleTaskSessionReverseRequest } from "../src/zcode-agent/zcodeTaskSessionRelay.js";

test("session/read relay 保留 caller 身份并单独传递 target", async () => {
  const responses: unknown[] = [];
  let received: Record<string, unknown> | undefined;
  const handled = handleTaskSessionReverseRequest({
    request: {
      id: "read_1",
      method: zcodeProtocolMethods.sessionReadSession,
      params: {
        requestId: "request_1",
        sessionId: "caller_1",
        workspaceKey: "caller_workspace",
        workspacePath: "C:/caller",
        targetSessionId: "target_1",
        messageLimit: 3,
      },
    } as ZCodeProtocolRequest,
    client: {
      respond: async (_id, result) => { responses.push(result); },
      respondError: async (_id, error) => { responses.push(error); },
    },
    taskExecutor: {
      readSession: async (input) => {
        received = input as unknown as Record<string, unknown>;
        return {} as never;
      },
    } as never,
  });

  assert.equal(handled, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(received?.callerSessionId, "caller_1");
  assert.equal(received?.targetSessionId, "target_1");
  assert.deepEqual(responses, [{}]);
});
