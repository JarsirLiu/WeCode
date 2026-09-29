import type { ToolCallRow } from "@zcode/shared/zcode-protocol-v4";
import { toolCallRowToLegacyNode } from "@/v4/toolCallRowAdapter.js";

export const SESSION_BOT_TOOL_NAMES = [
  "CreateSession",
  "ReadSession",
  "SendSessionMessage",
] as const;
export type SessionBotToolName = (typeof SESSION_BOT_TOOL_NAMES)[number];

export interface SessionBotWorkItem {
  kind: "sessionBot";
  key: string;
  rowId: number;
  rows: ToolCallRow[];
  node: ReturnType<typeof buildSessionBotNode>;
}

function isSessionBotToolName(name: string): name is SessionBotToolName {
  return (SESSION_BOT_TOOL_NAMES as readonly string[]).includes(name);
}

function readStatus(rows: readonly ToolCallRow[]): string {
  if (rows.some((row) => row.status === "error")) return "failed";
  if (rows.some((row) => row.status === "cancelled")) return "stopped";
  if (rows.some((row) => row.status !== "success")) return "in_progress";
  return "completed";
}

function buildSessionBotNode(rows: readonly ToolCallRow[]) {
  const first = rows[0]!;
  const readRow = rows.find((row) => row.toolName === "ReadSession");
  const failed = rows.find((row) => row.status === "error");
  const outputText = readRow?.output?.text;
  return {
    toolCall: {
      toolId: `session-bot:${first.toolCallId}`,
      toolName: "SessionBot",
      kind: "sessionBot",
      title: "Session",
      input: {},
      status: readStatus(rows) as "failed" | "stopped" | "in_progress" | "completed",
      output: outputText,
      error: failed?.error?.message,
      startedAt: first.startedAt,
    },
    childToolCalls: rows.map((row) => toolCallRowToLegacyNode(row)),
  };
}

function hasExpectedOrder(rows: readonly ToolCallRow[]): boolean {
  if (rows.length < 2) return false;
  const names = rows.map((row) => row.toolName);
  return (
    names[0] === "CreateSession" &&
    names.length === 3 &&
    new Set(names).size === 3 &&
    names.every(isSessionBotToolName) &&
    names.includes("ReadSession") &&
    names.includes("SendSessionMessage")
  );
}

export function isSessionBotToolCallRow(row: unknown): row is ToolCallRow {
  return (
    typeof row === "object" &&
    row !== null &&
    (row as { kind?: unknown }).kind === "toolCall" &&
    isSessionBotToolName((row as ToolCallRow).toolName)
  );
}

export function buildSessionBotWorkItem(rows: readonly ToolCallRow[]): SessionBotWorkItem | null {
  if (!hasExpectedOrder(rows)) return null;
  const first = rows[0]!;
  return {
    kind: "sessionBot",
    key: `session-bot:${first.rowId}`,
    rowId: first.rowId,
    rows: [...rows],
    node: buildSessionBotNode(rows),
  };
}
