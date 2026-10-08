import { PackageOpen, Search } from "lucide-react";
import { useMemo } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ToolLayout } from "../ToolLayout.js";
import type { ToolCallBlockRenderContext } from "../shared.js";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsedOutput(value: unknown): Record<string, unknown> | null {
  const raw = typeof value === "string" ? value : (record(value)?.text ?? record(value)?.output);
  if (typeof raw !== "string") return null;
  try {
    return record(JSON.parse(raw));
  } catch {
    return null;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function ToolDiscoveryToolCallBlock(context: ToolCallBlockRenderContext) {
  const { intl } = useZCodeIntl();
  const { toolCall } = context.toolCallNode;
  const input = record(toolCall.input);
  const output = useMemo(() => parsedOutput(toolCall.output), [toolCall.output]);
  const isSearch = toolCall.toolName === "ToolSearch" || toolCall.toolName === "tool_search";
  const action = intl.formatMessage({
    id: isSearch
      ? "chat.toolCall.toolDiscovery.tool.ToolSearch"
      : "chat.toolCall.toolDiscovery.tool.LoadToolSet",
  });
  const query = text(input?.query);
  const toolsetId = text(input?.toolset_id);
  const resultCount = Array.isArray(output?.results) ? output.results.length : undefined;
  const searchResults = Array.isArray(output?.results)
    ? output.results.flatMap((item) => {
        const result = record(item);
        if (!result) return [];
        const id = text(result.id);
        return id
          ? [
              {
                id,
                description: text(result.description),
                loaded: result.loaded === true,
              },
            ]
          : [];
      })
    : [];
  const toolsetSpec = record(output?.toolset_spec);
  const toolsetDescription = text(toolsetSpec?.description);
  const loadedCount = Array.isArray(output?.loaded_tools) ? output.loaded_tools.length : undefined;
  const alreadyLoadedCount = Array.isArray(output?.already_loaded_tools)
    ? output.already_loaded_tools.length
    : undefined;
  const loadedTools = strings(output?.loaded_tools);
  const alreadyLoadedTools = strings(output?.already_loaded_tools);
  const details = isSearch
    ? query
      ? intl.formatMessage({ id: "chat.toolCall.toolDiscovery.detail.query" }, { value: query })
      : resultCount === undefined
        ? undefined
        : intl.formatMessage(
            { id: "chat.toolCall.toolDiscovery.detail.results" },
            { count: resultCount },
          )
    : toolsetId;
  const resultSummary = isSearch
    ? undefined
    : loadedCount === undefined
      ? undefined
      : intl.formatMessage(
          { id: "chat.toolCall.toolDiscovery.detail.loaded" },
          { loaded: loadedCount, already: alreadyLoadedCount ?? 0 },
        );

  return (
    <ToolLayout
      toolId={toolCall.toolId}
      icon={
        isSearch ? (
          <Search className="size-4 shrink-0 text-foreground-subtle" />
        ) : (
          <PackageOpen className="size-4 shrink-0 text-foreground-subtle" />
        )
      }
      showIcon={context.showIcon !== false}
      canToggle={context.canToggle ?? true}
      forceOpen={context.forceOpen ?? false}
      hideSecondaryTextWhenOpen
      kindLabel={action}
      sourceLabel={context.sourceLabel}
      primaryText={
        <span className="truncate font-mono text-foreground-subtlest">{details ?? action}</span>
      }
      secondaryText={resultSummary ? <span className="truncate">{resultSummary}</span> : null}
      statusLabel={context.statusLabel}
      statusTooltip={toolCall.status === "failed" ? (context.errorText ?? undefined) : undefined}
      showFailureStatus={toolCall.status === "failed"}
      isRunning={context.isRunning}
      title={toolCall.title}
      renderContent={() => (
        <div className="mb-2 space-y-1 rounded-xl border border-border bg-panel px-4 py-3 font-mono text-ui-base text-foreground-subtle">
          {query ? (
            <p>
              {intl.formatMessage(
                { id: "chat.toolCall.toolDiscovery.detail.query" },
                { value: query },
              )}
            </p>
          ) : null}
          {toolsetId ? (
            <p>
              {intl.formatMessage(
                { id: "chat.toolCall.toolDiscovery.detail.toolset" },
                { value: toolsetId },
              )}
            </p>
          ) : null}
          {toolsetDescription ? <p>{toolsetDescription}</p> : null}
          {searchResults.length > 0 ? (
            <div className="space-y-1">
              {searchResults.map((result) => (
                <p key={result.id}>
                  <strong className="font-semibold text-foreground">{result.id}</strong>
                  {result.loaded
                    ? ` · ${intl.formatMessage({ id: "chat.toolCall.toolDiscovery.detail.loadedState" })}`
                    : ""}
                  {result.description ? ` · ${result.description}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          {resultCount !== undefined && searchResults.length === 0 ? (
            <p>
              {intl.formatMessage(
                { id: "chat.toolCall.toolDiscovery.detail.results" },
                { count: resultCount },
              )}
            </p>
          ) : null}
          {resultSummary ? <p>{resultSummary}</p> : null}
          {loadedTools.length > 0 ? (
            <p>
              {intl.formatMessage(
                { id: "chat.toolCall.toolDiscovery.detail.loadedTools" },
                { value: loadedTools.join(", ") },
              )}
            </p>
          ) : null}
          {alreadyLoadedTools.length > 0 ? (
            <p>
              {intl.formatMessage(
                { id: "chat.toolCall.toolDiscovery.detail.alreadyLoadedTools" },
                { value: alreadyLoadedTools.join(", ") },
              )}
            </p>
          ) : null}
          {!query &&
          !toolsetId &&
          searchResults.length === 0 &&
          !toolsetDescription &&
          resultCount === undefined &&
          !resultSummary &&
          !context.isRunning ? (
            <p>{intl.formatMessage({ id: "chat.toolCall.toolDiscovery.noOutput" })}</p>
          ) : null}
          {toolCall.status === "failed" && context.errorText ? (
            <p className="whitespace-pre-wrap text-destructive">{context.errorText}</p>
          ) : null}
        </div>
      )}
    />
  );
}
