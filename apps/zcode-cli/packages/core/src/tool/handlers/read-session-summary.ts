import type { ReadSessionOutput } from "@zcode/contracts";

const MAX_PREVIEW_LENGTH = 1_000;

type SnapshotPart = {
  type?: string;
  text?: string;
  tool?: string;
  callId?: string;
  state?: { status?: string; startedAt?: number; completedAt?: number };
};

type Snapshot = {
  session?: { sessionId?: string; title?: string };
  projection?: {
    status?: ReadSessionOutput["status"];
    turnCount?: number;
    totalTokenCount?: number;
    contextUsed?: number;
    contextWindow?: number;
    pendingPermissions?: unknown[];
    lastError?: { message?: string };
  };
  messages?: Array<{
    info?: { role?: "user" | "assistant"; time?: { created?: number } };
    parts?: SnapshotPart[];
  }>;
};

function preview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= MAX_PREVIEW_LENGTH
    ? value
    : `${value.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}

type ToolCallStatus = "pending" | "running" | "completed" | "failed" | "denied";

function toolStatus(status: string): ToolCallStatus | undefined {
  if (status === "error") return "failed";
  return status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "denied"
    ? status
    : undefined;
}

export function summarizeReadSessionOutput(output: unknown): ReadSessionOutput {
  const snapshot = output as Snapshot;
  if (!snapshot.session || !snapshot.projection) {
    const compact = output as { taskId?: string; title?: string; status?: ReadSessionOutput["status"] };
    return {
      sessionId: compact.taskId ?? "unknown",
      ...(compact.title ? { title: compact.title } : {}),
      status: compact.status ?? "idle",
    };
  }

  const messages: NonNullable<ReadSessionOutput["messages"]> = [];
  const toolCalls: NonNullable<ReadSessionOutput["toolCalls"]> = [];
  for (const message of snapshot.messages ?? []) {
    const role = message.info?.role;
    if (!role) continue;
    const content = preview(
      (message.parts ?? [])
        .filter((part) => part.type === "text" || part.type === "reasoning")
        .map((part) => part.text ?? "")
        .filter(Boolean)
        .join("\n"),
    );
    messages.push({
      role,
      content: content ?? "",
      ...(message.info?.time?.created !== undefined
        ? { timestamp: message.info.time.created }
        : {}),
    });
    for (const part of message.parts ?? []) {
      const status = part.state?.status ? toolStatus(part.state.status) : undefined;
      if (part.type !== "tool" || !part.tool || !part.callId || !status) continue;
      toolCalls.push({
        toolCallId: part.callId,
        toolName: part.tool,
        status,
        ...(part.state?.startedAt !== undefined ? { startedAt: part.state.startedAt } : {}),
        ...(part.state?.completedAt !== undefined ? { completedAt: part.state.completedAt } : {}),
      });
    }
  }

  return {
    sessionId: snapshot.session.sessionId ?? "unknown",
    ...(snapshot.session.title ? { title: snapshot.session.title } : {}),
    status: snapshot.projection.status ?? "idle",
    ...(snapshot.projection.turnCount !== undefined
      ? { turnCount: snapshot.projection.turnCount }
      : {}),
    ...(snapshot.projection.totalTokenCount !== undefined
      ? { totalTokenCount: snapshot.projection.totalTokenCount }
      : {}),
    ...(snapshot.projection.contextUsed !== undefined
      ? { contextUsed: snapshot.projection.contextUsed }
      : {}),
    ...(snapshot.projection.contextWindow !== undefined
      ? { contextWindow: snapshot.projection.contextWindow }
      : {}),
    messages,
    toolCalls,
    pendingPermissions: snapshot.projection.pendingPermissions?.length ?? 0,
    ...(snapshot.projection.lastError?.message
      ? { lastError: preview(snapshot.projection.lastError.message) }
      : {}),
  };
}
