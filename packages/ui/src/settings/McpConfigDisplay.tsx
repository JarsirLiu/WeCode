/**
 * MCP Configuration Display Component
 *
 * Displays the MCP configuration JSON with copy functionality.
 */
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";

const MCP_CONFIG = {
  mcpServers: {
    zcode: {
      command: "npx",
      args: ["zcode", "mcp", "stdio"],
      env: {
        ZCODE_AGENT_HOST: "127.0.0.1",
        ZCODE_AGENT_PORT: "3000",
      },
    },
  },
};

export function McpConfigDisplay() {
  const { intl } = useZCodeIntl();
  const configJson = JSON.stringify(MCP_CONFIG, null, 2);

  const handleCopyConfig = () => {
    navigator.clipboard
      .writeText(configJson)
      .then(() => {
        toast(intl.formatMessage({ id: "settings.mcp.config.copied" }), {
          durationMs: 3_000,
        });
      })
      .catch(() => {
        logger.warn("[mcp] failed to copy config");
        toast(intl.formatMessage({ id: "settings.mcp.toggleFailed" }), {
          durationMs: 5_000,
        });
      });
  };

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <div className="space-y-1">
        <div className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.mcp.config.title" })}
        </div>
        <div className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.mcp.config.description" })}
        </div>
      </div>
      <div className="relative">
        <pre className="bg-background rounded px-3 py-2 text-ui-xs text-foreground overflow-x-auto">
          {configJson}
        </pre>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute right-2 top-2"
          onClick={handleCopyConfig}
        >
          {intl.formatMessage({ id: "settings.mcp.config.copy" })}
        </Button>
      </div>
    </div>
  );
}
