/**
 * MCP Enable Toggle Component
 *
 * Manages the global MCP enable/disable switch.
 */
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";

export interface McpEnableToggleProps {
  mcpEnabled: boolean;
  onMcpEnabledChange?: (enabled: boolean) => Promise<void>;
}

export function McpEnableToggle({
  mcpEnabled,
  onMcpEnabledChange,
}: McpEnableToggleProps) {
  const { intl } = useZCodeIntl();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="space-y-1">
        <div className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.mcp.enable.title" })}
        </div>
        <div className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.mcp.enable.description" })}
        </div>
      </div>
      <Switch
        checked={mcpEnabled}
        onCheckedChange={(checked: boolean) => {
          onMcpEnabledChange?.(checked).catch((error) => {
            logger.warn("[mcp] failed to toggle MCP", {
              error: error instanceof Error ? error.message : String(error),
            });
            toast(intl.formatMessage({ id: "settings.mcp.toggleFailed" }), {
              durationMs: 5_000,
            });
          });
        }}
        disabled={!onMcpEnabledChange}
      />
    </div>
  );
}
