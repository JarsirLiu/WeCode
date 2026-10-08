import { BotIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ToolSnapshotFieldNotice } from "@/ToolCallBlocks/ToolSnapshotFieldNotice.js";
import { ToolLayout } from "../ToolLayout.js";
import type { ToolCallBlockRenderContext } from "../shared.js";
import { readListSessionsInput } from "./session-orchestration-list-sessions.js";
import { readWorkspaceOutputFields } from "./session-orchestration-workspace.js";

const SESSION_ORCHESTRATION_ICON = <BotIcon className="size-4 shrink-0 text-foreground-subtle" />;

type SessionToolCall = ToolCallBlockRenderContext["toolCallNode"]["toolCall"];

const SNIPPET_MAX_LENGTH = 64;

const ACTION_LABEL_ID_BY_TOOL: Record<string, string> = {
  CreateSession: "chat.toolCall.sessionBot.step.CreateSession",
  ReadSession: "chat.toolCall.sessionBot.step.ReadSession",
  SendSessionMessage: "chat.toolCall.sessionBot.step.SendSessionMessage",
  StopSessionGeneration: "chat.toolCall.sessionOrchestration.tool.StopSessionGeneration",
  SetSessionModel: "chat.toolCall.sessionOrchestration.tool.SetSessionModel",
  CompactSession: "chat.toolCall.sessionOrchestration.tool.CompactSession",
  ResolveSessionPermission: "chat.toolCall.sessionOrchestration.tool.ResolveSessionPermission",
  WorkspaceList: "chat.toolCall.sessionOrchestration.tool.WorkspaceList",
  ListSessions: "chat.toolCall.sessionOrchestration.tool.ListSessions",
  workspace_list: "chat.toolCall.sessionOrchestration.tool.WorkspaceList",
  list_sessions: "chat.toolCall.sessionOrchestration.tool.ListSessions",
};

interface DetailField {
  labelId: string;
  value?: string;
  valueLabelId?: string;
  values?: Record<string, string | number>;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]; return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

function toSnippet(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= SNIPPET_MAX_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, SNIPPET_MAX_LENGTH)}…`;
}

function readInputRecord(toolCall: SessionToolCall): Record<string, unknown> | null {
  return isPlainRecord(toolCall.input) ? toolCall.input : null;
}

function readTargetSessionId(toolCall: SessionToolCall): string | undefined {
  const input = readInputRecord(toolCall);
  if (!input) {
    return undefined;
  }
  return readString(input, "taskId") ?? readString(input, "sessionId");
}

function readModelSelectionLabel(toolCall: SessionToolCall): string | undefined {
  const input = readInputRecord(toolCall);
  if (!input || !isPlainRecord(input.modelSelection)) return undefined;
  const modelId = readString(input.modelSelection, "modelId");
  const thoughtLevel = readString(input.modelSelection, "thoughtLevel");
  if (modelId && thoughtLevel) {
    return `${modelId} (${thoughtLevel})`;
  }
  return modelId;
}

function readPrimaryText(toolCall: SessionToolCall): string | undefined {
  const input = readInputRecord(toolCall);
  switch (toolCall.toolName) {
    case "SendSessionMessage":
      return toSnippet(input ? readString(input, "content") : undefined);
    case "CreateSession":
      return toSnippet(input ? readString(input, "initialPrompt") : undefined);
    case "SetSessionModel":
      return readModelSelectionLabel(toolCall);
    case "ResolveSessionPermission":
      return input ? readString(input, "requestId") : undefined;
    case "ListSessions":
    case "list_sessions":
      return readListSessionsInput(input).primaryText;
    case "ReadSession":
    case "StopSessionGeneration":
    case "CompactSession":
    case "WorkspaceList":
    case "workspace_list":
    default:
      return readTargetSessionId(toolCall);
  }
}

function readSecondaryText(toolCall: SessionToolCall): string | undefined {
  const input = readInputRecord(toolCall);
  if (!input) {
    return undefined;
  }
  switch (toolCall.toolName) {
    case "SendSessionMessage":
      return readString(input, "taskId");
    case "CreateSession":
      return toSnippet(readString(input, "workspacePath"));
    case "ReadSession":
      return input.messageLimit === undefined ? undefined : `limit=${String(input.messageLimit)}`;
    case "StopSessionGeneration":
      return readString(input, "runId");
    case "SetSessionModel":
      return readString(input, "taskId");
    case "ResolveSessionPermission":
      return readString(input, "decision");
    case "ListSessions":
    case "list_sessions":
      return readListSessionsInput(input).secondaryText;
    case "CompactSession":
    case "WorkspaceList":
    case "workspace_list":
    default:
      return undefined;
  }
}

function readInputFields(toolCall: SessionToolCall): DetailField[] {
  const input = readInputRecord(toolCall);
  if (!input) {
    return [];
  }
  if (toolCall.toolName === "ListSessions" || toolCall.toolName === "list_sessions") return readListSessionsInput(input).fields;
  const fields: DetailField[] = [];
  const push = (labelId: string, value: string | undefined) => {
    if (value) {
      fields.push({ labelId, value });
    }
  };
  push("chat.toolCall.sessionOrchestration.field.target", readTargetSessionId(toolCall));
  push("chat.toolCall.sessionOrchestration.field.workspace", readString(input, "workspacePath"));
  push("chat.toolCall.sessionOrchestration.field.mode", readString(input, "mode"));
  push("chat.toolCall.sessionOrchestration.field.approval", readString(input, "approvalPolicy"));
  push("chat.toolCall.sessionOrchestration.field.prompt", readString(input, "initialPrompt"));
  push("chat.toolCall.sessionOrchestration.field.content", readString(input, "content"));
  push("chat.toolCall.sessionOrchestration.field.model", readModelSelectionLabel(toolCall));
  push("chat.toolCall.sessionOrchestration.field.decision", readString(input, "decision"));
  push("chat.toolCall.sessionOrchestration.field.request", readString(input, "requestId"));
  return fields;
}

function readOutputText(toolCall: SessionToolCall): string | undefined {
  const value = toolCall.output;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (isPlainRecord(value)) {
    const text = value.text ?? value.output;
    if (typeof text === "string" && text.trim().length > 0) {
      return text;
    }
  }
  return undefined;
}

function parseJsonOutput(text: string | undefined): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function readOutputFields(toolCall: SessionToolCall): DetailField[] {
  const parsed = parseJsonOutput(readOutputText(toolCall));
  if (parsed === null || parsed === undefined) {
    return [];
  }
  const fields: DetailField[] = [];
  const push = (labelId: string, value: string | undefined) => {
    if (value) {
      fields.push({ labelId, value });
    }
  };

  switch (toolCall.toolName) {
    case "CreateSession": {
      if (!isPlainRecord(parsed)) break;
      push("chat.toolCall.sessionOrchestration.field.sessionId", readString(parsed, "taskId"));
      push("chat.toolCall.sessionOrchestration.field.title", readString(parsed, "title"));
      push("chat.toolCall.sessionOrchestration.field.mode", readString(parsed, "mode"));
      break;
    }
    case "SendSessionMessage": {
      if (!isPlainRecord(parsed)) break;
      push("chat.toolCall.sessionOrchestration.field.messageId", readString(parsed, "messageId"));
      push("chat.toolCall.sessionOrchestration.field.turnId", readString(parsed, "turnId"));
      if (typeof parsed.deduplicated === "boolean") {
        fields.push({
          labelId: "chat.toolCall.sessionOrchestration.field.dedup",
          valueLabelId: parsed.deduplicated
            ? "chat.toolCall.sessionOrchestration.yes"
            : "chat.toolCall.sessionOrchestration.no",
        });
      }
      break;
    }
    case "ResolveSessionPermission": {
      if (!isPlainRecord(parsed)) break;
      push("chat.toolCall.sessionOrchestration.field.status", readString(parsed, "status"));
      push("chat.toolCall.sessionOrchestration.field.decision", readString(parsed, "decision"));
      break;
    }
    case "ReadSession": {
      if (!isPlainRecord(parsed)) break;
      const session = isPlainRecord(parsed.session) ? parsed.session : null;
      if (session) {
        push("chat.toolCall.sessionOrchestration.field.title", readString(session, "title"));
        push("chat.toolCall.sessionOrchestration.field.status", readString(session, "status"));
        push("chat.toolCall.sessionOrchestration.field.mode", readString(session, "mode"));
      }
      if (Array.isArray(parsed.messages)) {
        fields.push({
          labelId: "chat.toolCall.sessionOrchestration.field.messages",
          value: String(parsed.messages.length),
        });
      }
      if (Array.isArray(parsed.todos)) {
        fields.push({
          labelId: "chat.toolCall.sessionOrchestration.field.todos",
          value: String(parsed.todos.length),
        });
      }
      break;
    }
    case "StopSessionGeneration": {
      fields.push({ labelId: "chat.toolCall.sessionOrchestration.summary.stopped", value: "" });
      break;
    }
    case "SetSessionModel": {
      if (Array.isArray(parsed)) {
        fields.push({
          labelId: "chat.toolCall.sessionOrchestration.summary.options",
          value: "",
          values: { count: parsed.length },
        });
      }
      break;
    }
    case "CompactSession": {
      if (isPlainRecord(parsed)) {
        const taskId = readString(parsed, "taskId") ?? readString(parsed, "sessionId");
        if (taskId) {
          fields.push({
            labelId: "chat.toolCall.sessionOrchestration.field.sessionId",
            value: taskId,
          });
        }
      }
      break;
    }
    case "ListSessions":
    case "list_sessions": {
      if (isPlainRecord(parsed) && Array.isArray(parsed.sessions)) {
        fields.push({
          labelId: "chat.toolCall.sessionOrchestration.field.sessions",
          value: String(parsed.sessions.length),
        });
        for (const item of parsed.sessions) {
          if (!isPlainRecord(item)) continue;
          const title = readString(item, "title") ?? readString(item, "sessionId");
          const sessionId = readString(item, "sessionId");
          const status = readString(item, "status");
          const metadata = [sessionId, status].filter(Boolean).join(" · ");
          fields.push({
            labelId: "chat.toolCall.sessionOrchestration.field.sessionItem",
            value: metadata ? `${title} · ${metadata}` : title,
          });
        }
      }
      break;
    }
    case "WorkspaceList":
    case "workspace_list": {
      fields.push(...readWorkspaceOutputFields(parsed));
      break;
    }
    default:
      break;
  }
  return fields;
}

export function SessionOrchestrationToolCallBlock(context: ToolCallBlockRenderContext) {
  const { intl } = useZCodeIntl();
  const { toolCall } = context.toolCallNode;
  const primaryText = readPrimaryText(toolCall);
  const secondaryText = readSecondaryText(toolCall);
  const inputFields = useMemo(() => readInputFields(toolCall), [toolCall]);
  const outputFields = useMemo(() => readOutputFields(toolCall), [toolCall]);
  const fallbackOutputText = useMemo(() => {
    const text = readOutputText(toolCall);
    return text !== undefined && parseJsonOutput(text) === null ? text : undefined;
  }, [toolCall]);
  const errorText = toolCall.status === "failed" ? context.errorText : undefined;
  const actionLabelId = ACTION_LABEL_ID_BY_TOOL[toolCall.toolName ?? ""];
  const actionLabel = actionLabelId
    ? intl.formatMessage({ id: actionLabelId })
    : (toolCall.title ?? toolCall.toolName);
  const noOutputLabel = intl.formatMessage({
    id: "chat.toolCall.sessionOrchestration.noOutput",
  });
  const renderFields = useCallback(
    (fields: DetailField[]) =>
      fields.length > 0 ? (
        <div className="space-y-1">
          {fields.map((field, index) => {
            const label = intl.formatMessage(
              { id: field.labelId },
              field.values as Record<string, string | number> | undefined,
            );
            const value = field.valueLabelId
              ? intl.formatMessage({ id: field.valueLabelId })
              : field.value;
            if (value === undefined || value === "") {
              return (
                <p
                  key={`${field.labelId}-${index}`}
                  className="font-mono text-ui-base text-foreground-subtle"
                >
                  {label}
                </p>
              );
            }
            return (
              <div
                key={`${field.labelId}-${index}`}
                className="flex items-start gap-2 font-mono text-ui-base text-foreground"
              >
                <span className="shrink-0 text-foreground-subtle">{label}</span>
                <span className="min-w-0 break-words text-foreground-subtle">{value}</span>
              </div>
            );
          })}
        </div>
      ) : null,
    [intl],
  );
  const renderContent = useCallback(() => {
    const hasInput = inputFields.length > 0;
    const hasOutput = outputFields.length > 0 || fallbackOutputText !== undefined;
    return (
      <div className="mb-2 space-y-2 rounded-xl border border-border bg-panel px-4 py-3">
        {renderFields(inputFields)}
        {renderFields(outputFields)}
        {fallbackOutputText ? (
          <pre className="max-h-50 overflow-auto whitespace-pre-wrap break-words font-mono text-ui-base text-foreground-subtle">
            {fallbackOutputText}
          </pre>
        ) : null}
        {errorText ? (
          <p className="whitespace-pre-wrap break-words text-destructive">{errorText}</p>
        ) : null}
        {!hasInput && !hasOutput && !errorText && !context.isRunning ? (
          <p className="font-mono text-ui-base text-foreground-subtle">{noOutputLabel}</p>
        ) : null}
      </div>
    );
  }, [
    context.isRunning,
    errorText,
    fallbackOutputText,
    inputFields,
    noOutputLabel,
    outputFields,
    renderFields,
  ]);

  return (
    <>
      <ToolLayout
        toolId={toolCall.toolId}
        icon={SESSION_ORCHESTRATION_ICON}
        showIcon={context.showIcon !== false}
        canToggle={context.canToggle ?? true}
        forceOpen={context.forceOpen ?? false}
        hideSecondaryTextWhenOpen
        kindLabel={context.kindLabelOverride ?? actionLabel}
        sourceLabel={context.sourceLabel}
        primaryText={
          <span className="truncate font-mono text-foreground-subtlest">
            {primaryText ?? actionLabel}
          </span>
        }
        secondaryText={
          secondaryText ? <code className="truncate font-mono">{secondaryText}</code> : null
        }
        statusLabel={context.statusLabel}
        statusTooltip={toolCall.status === "failed" ? (errorText ?? undefined) : undefined}
        showFailureStatus={toolCall.status === "failed"}
        isRunning={context.isRunning}
        title={toolCall.title}
        renderContent={renderContent}
      />
      <ToolSnapshotFieldNotice
        refs={toolCall.snapshotRefs ?? []}
        onLoadFullToolCallFields={
          context.onLoadFullToolCallFields
            ? () => context.onLoadFullToolCallFields?.(toolCall.toolId)
            : undefined
        }
      />
    </>
  );
}
