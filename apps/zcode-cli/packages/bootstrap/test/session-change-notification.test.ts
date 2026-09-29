import assert from "node:assert/strict";
import test from "node:test";
import { ZCODE_SESSION_CHANGED_NOTIFICATION } from "@zcode/shared";
import {
  handleSessionChangedNotification,
} from "../src/zcode-protocol/session-change-notification.js";

function contextFor(creatorSessionId: string, received: string[]) {
  return {
    sessions: new Map([
      [
        creatorSessionId,
        {
          app: {
            sessionId: creatorSessionId,
            runtime: {
              enqueueBackgroundTaskNotification(input: { text: string }) {
                received.push(input.text);
              },
            },
          },
          traceContext: { traceId: "trace-creator" },
        },
      ],
    ]),
  } as never;
}

const notification = {
  targetSessionId: "target-session",
  creatorSessionId: "creator-session",
  sequence: 9,
  kind: "permission_requested" as const,
  turnId: "turn-1",
  requestId: "request-1",
  summary: "需要批准",
};

test("session/changed routes only to the explicitly named resident creator", () => {
  const received: string[] = [];
  const handled = handleSessionChangedNotification(
    contextFor(notification.creatorSessionId, received),
    ZCODE_SESSION_CHANGED_NOTIFICATION,
    notification,
  );

  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(received[0] ?? ""), {
    method: ZCODE_SESSION_CHANGED_NOTIFICATION,
    params: notification,
  });
});

test("invalid or absent creator runtime is rejected without starting or queueing", () => {
  const received: string[] = [];
  const context = contextFor(notification.creatorSessionId, received);

  assert.equal(
    handleSessionChangedNotification(
      context,
      ZCODE_SESSION_CHANGED_NOTIFICATION,
      { ...notification, creatorSessionId: "missing" },
    ),
    false,
  );
  assert.equal(
    handleSessionChangedNotification(
      context,
      ZCODE_SESSION_CHANGED_NOTIFICATION,
      { ...notification, sequence: -1 },
    ),
    false,
  );
  assert.deepEqual(received, []);
});
