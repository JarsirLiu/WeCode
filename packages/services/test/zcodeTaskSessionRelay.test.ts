import assert from "node:assert/strict";
import test from "node:test";
import { zcodeProtocolMethods, type ZCodeProtocolRequest } from "@zcode/shared";
import { handleTaskSessionReverseRequest } from "../src/zcode-agent/zcodeTaskSessionRelay.js";

test("task relay 将 executor 异常作为 JSON-RPC error 返回", async () => {
  const responses: { result?: unknown; error?: { code: number; message: string } }[] = [];
  const request: ZCodeProtocolRequest = {
    id: "relay_error_1",
    method: zcodeProtocolMethods.taskSendPrompt,
    params: {
      requestId: "request_1",
      sessionId: "creator_1",
      workspaceKey: "workspace_1",
      workspacePath: "C:/workspace",
      taskId: "task_1",
      traceId: "trace_1",
      content: "hello",
    },
  };

  const handled = handleTaskSessionReverseRequest({
    request,
    client: {
      respond: async (_id, result) => {
        responses.push({ result });
      },
      respondError: async (_id, error) => {
        responses.push({ error });
      },
    },
    taskExecutor: {
      sendPrompt: async () => {
        throw new Error("FOREIGN KEY constraint failed");
      },
    } as never,
  });

  assert.equal(handled, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(responses, [
    { error: { code: -32603, message: "FOREIGN KEY constraint failed" } },
  ]);
});
