/**
 * MCP Configuration Display Component
 *
 * 展示后端生成的 MCP 客户端配置 JSON。
 *
 * 配置必须由宿主在运行时生成：启动命令需要解析本机真实的 Node runtime 与 server CLI 入口，
 * 前端无法得知。此前前端硬编码 `npx zcode`，而该包名在 npm 上是无关占位包且没有 bin 入口，
 * 客户端 spawn 后进程立刻退出、stdout 为空，永远收不到 initialize 响应，
 * 表现为"已连接但工具列表为空"。
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { logger } from "@/logger.js";

type McpClientConfigState =
  | { status: "loading"; configJson: string }
  | { status: "ready"; configJson: string }
  | { status: "unavailable"; configJson: string };

export function McpConfigDisplay() {
  const { intl } = useZCodeIntl();
  const platform = useOptionalPlatform();
  const [state, setState] = useState<McpClientConfigState>({
    status: "loading",
    configJson: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const result = await platform?.loadMcpFromUserDirectory?.();
        if (cancelled) return;
        const configJson = result?.builtinMcpClientConfigJson?.trim();
        setState(configJson ? { status: "ready", configJson } : { status: "unavailable", configJson: "" });
      } catch (error) {
        if (cancelled) return;
        logger.warn("[mcp] failed to load builtin mcp client config", error);
        setState({ status: "unavailable", configJson: "" });
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const handleCopyConfig = () => {
    void navigator.clipboard
      .writeText(state.configJson)
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
      {state.status === "loading" ? (
        <div className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.mcp.config.loading" })}
        </div>
      ) : state.status === "unavailable" ? (
        <div className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.mcp.config.unavailable" })}
        </div>
      ) : (
        <div className="relative">
          <pre className="bg-background rounded px-3 py-2 text-ui-xs text-foreground overflow-x-auto">
            {state.configJson}
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
      )}
    </div>
  );
}
