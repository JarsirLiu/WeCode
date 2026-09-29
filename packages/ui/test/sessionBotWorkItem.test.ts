import { describe, expect, it } from "vitest";
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
    startedAt: 1,
  } as ToolCallRow;
}

describe("session bot work item", () => {
  it("groups either valid read/send order", () => {
    expect(
      buildSessionBotWorkItem([
        row(1, "CreateSession"),
        row(2, "ReadSession"),
        row(3, "SendSessionMessage"),
      ]),
    ).not.toBeNull();
    expect(
      buildSessionBotWorkItem([
        row(1, "CreateSession"),
        row(2, "SendSessionMessage"),
        row(3, "ReadSession"),
      ]),
    ).not.toBeNull();
  });

  it("does not group incomplete or interrupted chains", () => {
    expect(buildSessionBotWorkItem([row(1, "CreateSession"), row(2, "ReadSession")])).toBeNull();
    expect(
      buildSessionBotWorkItem([row(1, "CreateSession"), row(2, "Bash"), row(3, "ReadSession")]),
    ).toBeNull();
    expect(
      buildSessionBotWorkItem([
        row(1, "ReadSession"),
        row(2, "CreateSession"),
        row(3, "SendSessionMessage"),
      ]),
    ).toBeNull();
  });

  it("only classifies the three orchestration tools", () => {
    expect(isSessionBotToolCallRow(row(1, "CreateSession"))).toBe(true);
    expect(isSessionBotToolCallRow(row(2, "Bash"))).toBe(false);
  });
});
