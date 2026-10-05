import assert from "node:assert/strict";
import test from "node:test";
import type { ToolCallRow } from "@zcode/shared/zcode-protocol-v4";
import { buildSessionBotWorkItem, isSessionBotToolCallRow } from "@/v4/sessionBotWorkItem.js";

function row(rowId: number, toolName: string): ToolCallRow {
  return {
    kind: "toolCall",
    rowId,
    toolCallId: `tool-${rowId}`,
    toolName,
    status: "success",
    input: {},
    inputText: "",
    startedAt: 1,
  } as ToolCallRow;
}

test("session bot work item: groups either valid read/send order", () => {
  assert.notEqual(
    buildSessionBotWorkItem([
      row(1, "CreateSession"),
      row(2, "ReadSession"),
      row(3, "SendSessionMessage"),
    ]),
    null,
  );
  assert.notEqual(
    buildSessionBotWorkItem([
      row(1, "CreateSession"),
      row(2, "SendSessionMessage"),
      row(3, "ReadSession"),
    ]),
    null,
  );
});

test("session bot work item: does not group incomplete or interrupted chains", () => {
  assert.equal(buildSessionBotWorkItem([row(1, "CreateSession"), row(2, "ReadSession")]), null);
  assert.equal(
    buildSessionBotWorkItem([row(1, "CreateSession"), row(2, "Bash"), row(3, "ReadSession")]),
    null,
  );
  assert.equal(
    buildSessionBotWorkItem([
      row(1, "ReadSession"),
      row(2, "CreateSession"),
      row(3, "SendSessionMessage"),
    ]),
    null,
  );
});

test("session bot work item: only classifies the three orchestration tools", () => {
  assert.equal(isSessionBotToolCallRow(row(1, "CreateSession")), true);
  assert.equal(isSessionBotToolCallRow(row(2, "Bash")), false);
});
