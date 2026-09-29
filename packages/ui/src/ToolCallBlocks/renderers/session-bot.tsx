import { BotIcon, Check, Circle, X } from "lucide-react";
import { useCallback } from "react";
import { ToolLayout } from "@/ToolCallBlocks/ToolLayout.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { SessionBotWorkItem } from "@/v4/sessionBotWorkItem.js";

const SESSION_BOT_ICON = <BotIcon className="size-4 shrink-0 text-foreground-subtle" />;

export function SessionBotToolCallBlock({ item }: { item: SessionBotWorkItem }) {
  const { intl } = useZCodeIntl();
  const { toolCall } = item.node;
  const isRunning = toolCall.status === "in_progress";
  const isFailed = toolCall.status === "failed";
  const statusLabel = intl.formatMessage({
    id: isFailed
      ? "chat.toolCall.sessionBot.failed"
      : isRunning
        ? "chat.toolCall.sessionBot.running"
        : "chat.toolCall.sessionBot.completed",
  });
  const renderContent = useCallback(
    () => (
      <div className="space-y-2 text-ui-sm">
        <ol className="space-y-1.5">
          {item.rows.map((row) => (
            <li key={row.rowId} className="flex min-w-0 items-start gap-2 text-foreground-subtle">
              {row.status === "success" ? (
                <Check aria-hidden className="mt-0.5 size-3.5 text-success" />
              ) : row.status === "error" ? (
                <X aria-hidden className="mt-0.5 size-3.5 text-destructive" />
              ) : (
                <Circle aria-hidden className="mt-0.5 size-3.5 text-foreground-subtle" />
              )}
              <span className="min-w-0 break-words">
                {intl.formatMessage({ id: `chat.toolCall.sessionBot.step.${row.toolName}` })}
              </span>
            </li>
          ))}
        </ol>
        {toolCall.output ? (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 px-3 py-2 text-ui-xs text-foreground">
            {toolCall.output}
          </pre>
        ) : toolCall.error ? (
          <p className="whitespace-pre-wrap break-words text-destructive">{toolCall.error}</p>
        ) : null}
      </div>
    ),
    [intl, item.rows, toolCall.error, toolCall.output],
  );

  return (
    <ToolLayout
      toolId={toolCall.toolId}
      icon={SESSION_BOT_ICON}
      kindLabel={intl.formatMessage({ id: "chat.toolCall.sessionBot.label" })}
      primaryText={statusLabel}
      secondaryText={undefined}
      statusLabel={isFailed ? statusLabel : undefined}
      statusTooltip={isFailed ? toolCall.error : undefined}
      showFailureStatus={isFailed}
      isRunning={isRunning}
      autoOpen={isRunning}
      autoCollapseOnComplete
      renderContent={renderContent}
    />
  );
}
