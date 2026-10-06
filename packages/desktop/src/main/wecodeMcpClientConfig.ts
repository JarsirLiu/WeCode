/**
 * 内置 MCP 客户端配置生成
 *
 * 生成给外部 MCP 客户端（Cherry Studio、Claude Desktop 等）复制的标准配置。
 *
 * 启动命令必须由宿主在运行时解析：CLI 包未发布，前端硬编码 `npx zcode` 会命中 npm 上的
 * 无关占位包且没有 bin 入口，客户端 spawn 后进程立刻退出、stdout 为空，永远收不到
 * initialize 响应，表现为"已连接但工具列表为空"。
 */
import {
  buildWeCodeMcpClientConfig,
  createWeCodeMcpClientConfigJson,
  resolveWeCodeMcpEntrypoint,
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

export function resolveWeCodeBuiltinMcpClientConfig(
  logger: WeCodeMcpConfigLogger,
): WeCodeBuiltinMcpClientConfig {
  try {
    const resolution = resolveWeCodeMcpEntrypoint();
    if (!resolution.ok) {
      logger.warn("[mcp-client-config] entrypoint unavailable:", resolution.reason);
      return {};
    }
    const entry = buildWeCodeMcpClientConfig(resolution.entrypoint).mcpServers[WECODE_MCP_SERVER_KEY];
    if (!entry) return {};

    logger.info(
      "[mcp-client-config] resolved:",
      resolution.entrypoint.node,
      resolution.matchedLayout.join("/"),
    );

    return {
      builtinServers: [
        {
          source: "zcodeagentmcp",
          scope: "user",
          name: WECODE_MCP_SERVER_KEY,
          config: { command: entry.command, args: entry.args, env: entry.env },
          enabled: true,
        } satisfies NativeMcpServerRecord,
      ],
      builtinMcpClientConfigJson: createWeCodeMcpClientConfigJson(resolution.entrypoint),
    };
  } catch (error) {
    logger.warn("[mcp-client-config] generation failed:", error);
    return {};
  }
}
