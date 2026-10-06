import type { ServiceCollection } from "@zcode/services";
import { startDesktopMcpHttpListener } from "./mcpHttpListener.js";

type McpHttpListener = { close: () => Promise<void> };
type McpLogger = { warn: (...args: unknown[]) => void };

export async function closeDesktopMcpHttpListener(
  listener: McpHttpListener | undefined,
  logger: McpLogger,
): Promise<void> {
  await listener?.close().catch((error) => logger.warn("desktop MCP HTTP listener close failed", error));
}

export function startDesktopMcpHttpListenerBestEffort(
  services: ServiceCollection,
  logger: McpLogger,
  onReady: (listener: McpHttpListener | undefined) => void,
): void {
  void startDesktopMcpHttpListener(services, {
    onError: (error) => logger.warn("desktop MCP HTTP listener unavailable", error),
  }).then(onReady);
}

export function createDesktopMcpHttpLifecycle(logger: McpLogger) {
  let listener: McpHttpListener | undefined;
  return {
    start(services: ServiceCollection): void {
      startDesktopMcpHttpListenerBestEffort(services, logger, (next) => {
        listener = next;
      });
    },
    async close(): Promise<void> {
      await closeDesktopMcpHttpListener(listener, logger);
      listener = undefined;
    },
  };
}
