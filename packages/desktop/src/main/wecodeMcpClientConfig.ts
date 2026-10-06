/**
 * 内置 MCP 客户端配置生成
 *
 * 生成给外部 MCP 客户端复制的唯一 Streamable HTTP 配置。
 */
import {
  buildWeCodeMcpClientConfig,
  createWeCodeMcpClientConfigJson,
  DEFAULT_MCP_HTTP_PORT,
  WECODE_MCP_SERVER_KEY,
} from "@zcode/server/mcp";
import type {
  LoadCliMcpFromUserDirectoryResult,
  NativeMcpServerRecord,
} from "@zcode/shared";

export type WeCodeBuiltinMcpClientConfig = Pick<
  LoadCliMcpFromUserDirectoryResult,
  "builtinServers" | "builtinMcpClientConfigJson"
>;

export type WeCodeMcpConfigLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

export async function resolveWeCodeBuiltinMcpClientConfig(
  logger: WeCodeMcpConfigLogger,
): Promise<WeCodeBuiltinMcpClientConfig> {
  try {
    const url = process.env.WECODE_MCP_URL?.trim() || `http://127.0.0.1:${DEFAULT_MCP_HTTP_PORT}/mcp`;
    if (!url) {
      logger.warn("[mcp-client-config] runtime MCP endpoint is unavailable");
      return {};
    }
    const probe = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(750),
    });
    if (!probe.ok) {
      logger.warn("[mcp-client-config] runtime MCP endpoint is not ready:", probe.status);
      return {};
    }
    const entry = buildWeCodeMcpClientConfig({ url }).mcpServers[WECODE_MCP_SERVER_KEY];
    if (!entry) return {};

    logger.info(
      "[mcp-client-config] resolved:",
      url,
    );

    return {
      builtinServers: [
        {
          source: "zcodeagentmcp",
          scope: "user",
          name: WECODE_MCP_SERVER_KEY,
          config: {
            type: entry.type,
            url: entry.url,
            ...(entry.headers ? { headers: entry.headers } : {}),
          },
          enabled: true,
        } satisfies NativeMcpServerRecord,
      ],
      builtinMcpClientConfigJson: createWeCodeMcpClientConfigJson({ url }),
    };
  } catch (error) {
    logger.warn("[mcp-client-config] generation failed:", error);
    return {};
  }
}
