/**
 * WeCode MCP 客户端配置生成
 *
 * 外部 MCP 客户端（Cherry Studio、Claude Desktop 等）通过 stdio 拉起本产品的 MCP server。
 * 入口命令不能由 UI 硬编码：CLI 包未发布，`npx zcode` 会命中无关占位包并立即退出，
 * 客户端永远收不到 initialize 响应，表现为"已连接但工具列表为空"。
 *
 * 因此配置由后端生成：运行时才能知道自己该用哪个 Node runtime 和哪个入口脚本。
 * 生成逻辑是纯函数，路径解析单独隔离，便于单测和桌面宿主注入锚点。
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 外部客户端配置里的 server key，模型侧可见的服务标识 */
export const WECODE_MCP_SERVER_KEY = "wecode";

/** MCP server 的 stdio 启动子命令 */
export const WECODE_MCP_STDIO_SUBCOMMAND = ["mcp", "stdio"] as const;

/**
 * 桌面打包态下 process.execPath 是 app 内置的 Electron Helper，不是独立 Node 二进制。
 * 缺少该 env 时子进程会按 Electron main 启动，误触发 deep-link 注册等桌面副作用。
 * 与 apps/zcode-cli 的 official-plugin-runtime 使用同一套约定。
 */
export const WECODE_MCP_RUN_AS_NODE_ENV: Readonly<Record<string, string>> = {
  ELECTRON_RUN_AS_NODE: "1",
};

export interface WeCodeMcpServerClientEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** 标准 MCP 客户端配置结构（`mcpServers` 包裹，env 值全部为字符串） */
export interface WeCodeMcpClientConfig {
  mcpServers: Record<string, WeCodeMcpServerClientEntry>;
}

export interface WeCodeMcpEntrypoint {
  /** Node runtime 可执行文件绝对路径 */
  node: string;
  /** server-cli 入口脚本绝对路径 */
  serverCli: string;
}

/**
 * 相对锚点向上查找 server-cli 入口的候选布局。
 * 前两项覆盖开发检出（dist 产物优先，源码兜底），第三项覆盖桌面发布包的 runtime 目录。
 */
export const DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES: ReadonlyArray<readonly string[]> = [
  ["packages", "zcode-server-cli", "dist", "server-cli.js"],
  ["packages", "zcode-server-cli", "src", "main.ts"],
  ["runtime", "server-cli.js"],
];

export function buildWeCodeMcpClientConfig(
  entrypoint: WeCodeMcpEntrypoint,
): WeCodeMcpClientConfig {
  const node = entrypoint.node?.trim();
  if (!node) throw new Error("WeCode MCP client config requires a node runtime path");
  if (!isAbsolute(entrypoint.serverCli ?? "")) {
    throw new Error("WeCode MCP client config requires an absolute server-cli path");
  }
  return {
    mcpServers: {
      [WECODE_MCP_SERVER_KEY]: {
        command: node,
        args: [entrypoint.serverCli, ...WECODE_MCP_STDIO_SUBCOMMAND],
        env: { ...WECODE_MCP_RUN_AS_NODE_ENV },
      },
    },
  };
}

export function createWeCodeMcpClientConfigJson(
  entrypoint: WeCodeMcpEntrypoint,
): string {
  return `${JSON.stringify(buildWeCodeMcpClientConfig(entrypoint), null, 2)}\n`;
}

/** 目录向上的查找深度上限，避免在根文件系统上无限循环 */
const MAX_SEARCH_DEPTH = 12;

/**
 * 从锚点所在目录向上查找 server-cli 入口。
 * 锚点可以是任意已知位置：本模块文件、宿主 resourcesPath、可执行文件所在目录。
 */
export function findWeCodeMcpServerCliPath(
  anchors: readonly string[],
  candidates: ReadonlyArray<readonly string[]> = DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES,
): string | undefined {
  for (const anchor of anchors) {
    if (!anchor?.trim()) continue;
    let dir = isAbsolute(anchor) ? dirname(anchor) : anchor;
    for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
      for (const relativeParts of candidates) {
        const candidate = join(dir, ...relativeParts);
        if (existsSync(candidate)) return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

export interface WeCodeMcpEntrypointResolved {
  ok: true;
  entrypoint: WeCodeMcpEntrypoint;
  /** 命中的候选布局，用于设置页排障展示 */
  matchedLayout: readonly string[];
}

export interface WeCodeMcpEntrypointUnavailable {
  ok: false;
  reason: string;
}

export type WeCodeMcpEntrypointResult =
  | WeCodeMcpEntrypointResolved
  | WeCodeMcpEntrypointUnavailable;

/**
 * 解析本进程可用的 MCP server 入口。
 * 全部候选都不存在时返回 ok:false，由调用方向用户给出可操作的提示，而不是静默产出无效配置。
 */
export function resolveWeCodeMcpEntrypoint(options: {
  /** 查找起点；默认用本模块文件位置，宿主可注入 resourcesPath 等 */
  anchors?: readonly string[];
  /** Node runtime；默认用当前进程可执行文件 */
  node?: string;
  candidates?: ReadonlyArray<readonly string[]>;
}): WeCodeMcpEntrypointResult {
  const node = options.node?.trim() || process.execPath;
  const anchors = options.anchors ?? [fileURLToPath(import.meta.url)];
  const candidates = options.candidates ?? DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES;

  for (const anchor of anchors) {
    if (!anchor?.trim()) continue;
    const root = isAbsolute(anchor) ? dirname(anchor) : anchor;
    let dir = root;
    for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
      for (const relativeParts of candidates) {
        const candidate = join(dir, ...relativeParts);
        if (existsSync(candidate)) {
          return {
            ok: true,
            entrypoint: { node, serverCli: candidate },
            matchedLayout: relativeParts,
          };
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return {
    ok: false,
    reason:
      "未找到 WeCode server CLI 入口，无法生成 MCP 客户端配置。" +
      "请确认桌面端已完成安装或运行 pnpm build。",
  };
}
