# Agent Note: MCP 客户端配置由宿主生成，不在 UI 硬编码

Status: implemented

[English](2026-10-06-mcp-client-config-generated-by-host.md) | 中文

## Problem

桌面端设置里提供了一份可复制的 MCP JSON，供外部客户端（Cherry Studio 等）把 WeCode 当作 MCP server 连接。开启 MCP 后，客户端显示连接成功，但工具列表为空。

## Decision

在桌面 main 进程运行时生成 MCP 客户端配置，绝不在 UI 硬编码。配置携带解析出的 `node` 运行时路径 和绝对 `server-cli` 路径，加上 `ELECTRON_RUN_AS_NODE: "1"`，让外部客户端能以子进程身份调用它，不 依赖 app。配置只读，通过既有的 `PlatformChannels.LoadMcpFromUserDirectory` 通道下发。

## Root cause

三个互相独立的缺陷，按发现顺序排列。

1. **给出的命令根本无法解析。** UI 硬编码了 `"command": "npx", "args": ["zcode", "mcp", "stdio"]`。npm 上确实存在 `zcode` 包（`0.0.1`）， 但它是一个无关的占位包，`description` 是 `"This is a nice project"`，而且**没有声明 `bin` 字段**。真正的 server CLI 是 `packages/zcode-server-cli`（`@zcode/server-cli`， `private: true`，bin 名 `zcode`），从未发布。实测：`npx --yes zcode mcp stdio` → `exit 1`、 **stdout 0 字节**、`npm error could not determine executable to run`。

MCP 的 stdio 形态是：客户端**spawn** 出 server 子进程，通过该进程的 stdin/stdout 收发 JSON-RPC，不存在监听端口。所以命令解析不到东西就等于没有进程、没有 `initialize` 响应、 工具列表为空——正是用户看到的现象。

2. **提交进 git 的构建产物遮蔽了源码。** `packages/server/src/mcp/` 下存在 `index.js`、 `tool-adapter.js`、`tool-registry.js` 及其 `.d.ts`、`.map`，全部被 git 跟踪。`.map` 文件只会 由编译器生成，说明这些是误提交到 `src/` 里的构建产物。由于 `packages/server/src/index.ts` 导入的是 `./mcp/index.js`，esbuild 解析到了**过期的 `.js`** 而不是 `index.ts`。那份过期副本是 更早的 `createWeCodeMcpServer`，`new Server({ name, version })` **只有第一个参数**， `capabilities.tools` 从未声明。于是 SDK 的 `assertRequestHandlerCapability` 在 `setRequestHandler` 时就抛出 `Server does not support tools (required for tools/list)`——进程在 `connect()` 阶段就死掉，连一条输入都没读到。已针对打包产物逐项核对确认。

3. **server-cli 的 bundle 不是自洽的。** `packages/zcode-server-cli/tsup.config.ts` 的 `noExternal` 里有 `@zcode/shared`、`@zcode/rpc`、`@zcode/services`，但没有 `@zcode/server`。 而 `@zcode/server` 的 `exports` 指向 `.ts` 源码，因此产物在运行时解析它并崩溃： `ERR_MODULE_NOT_FOUND packages/server/src/http.js`。`zcode status` 子命令也因同样原因崩溃， 说明这是既有问题，不是 MCP 工作引入的。

## Fix

- 新增 `packages/server/src/mcp/client-config.ts` — 纯函数生成器。`WECODE_MCP_SERVER_KEY = "wecode"`、 `buildWeCodeMcpClientConfig({ node, serverCli })`、`createWeCodeMcpClientConfigJson`，以及 `resolveWeCodeMcpEntrypoint`（从锚点向上按候选布局查找；全部落空时返回 `ok: false`， 绝不产出无效配置）。env 值一律字符串；只注入 `ELECTRON_RUN_AS_NODE: "1"`，与既有 `official-plugin-runtime.ts` 的约定一致——桌面打包态 `process.execPath` 是 Electron Helper， 缺该 env 会误进 Electron main。 - 删除 `packages/server/src/mcp/` 下的 12 个过期构建产物。 - 把 `@zcode/server` 加入 server-cli 的 `noExternal`，并把 `yazl`/`yauzl` 加入 `external`， 与 server 包自己的 external 策略对齐（这两个是 CJS 包，内联后会崩溃）。 - `LoadCliMcpFromUserDirectoryResult` 增加只读字段 `builtinServers` 与 `builtinMcpClientConfigJson`。 生成失败返回 `{}`，不影响既有的用户 MCP 列表读取。 - `McpConfigDisplay` 改为读取后端结果，缺失时展示加载/不可用状态。

## Alternatives considered

**Option A：发布独立 CLI，按名字引用。** 这是 MCP 的标准分发形态，也是长期正解——不依赖 app、 对任何用户都稳定。落选是因为需要 `private: false` 加发布流水线，属于发布工程而非代码改动。

**Option B：用 `process.execPath` 让 Electron 当 runtime。** 技术上可行，官方插件 MCP 就是这么做的， 但那些 server 是 WeCode 自己的 agent 在 app 安装目录内拉起的。对外部客户端而言，这会把配置绑定到 一个安装路径专属、并非稳定公开 API 的 Helper 二进制，卸载或升级即失效。

**Option C：把虚拟记录注入用户 MCP server 列表。** 拒绝——会在用户的 MCP 设置列表里出现一个幻影 server，且有让 agent 把自己当外部 MCP server 的风险。

## Consequences

**可观测的结果：** 桌面端设置里现在显示实时生成、可复制的 MCP JSON，其 `command` 在当前机器上可解析。 用该命令真实 spawn 能完成 `initialize` 并列出全部 9 个工具、stderr 干净。UI 中不再出现 `npx` 字符串或 硬编码安装路径。

**长期姿态：** 配置只读、不落盘——写进用户 MCP 目录会让 agent 把本产品自己当外部 MCP server 拉起来。 入口解析带有安全逻辑（`ok: false` 而非无效配置），所以布局变更时会降级为诚实的"不可用"而不是 静默产出错误 JSON。

**已知限制：** `createWeCodeToolHandler` 仍是抛错的桩实现，所以每个 `tools/call` 都会返回错误， 直到接入 core 处理器。CLI 仍未发布，所以暂时无法用 `command: "wecode"`-by-name 的配置（Option A 延后）。

## Risks

- bundle 内的 `mcp stdio` 入口只通过桌面构建验证过；桌面 IPC 往返链路本身在本次环境中未执行， 所以 `builtinMcpClientConfigJson` 送达 renderer 只经过类型检查，未做运行时验证。 - 入口解析锚定在检出/发布布局上。布局变更而未同步更新 `DEFAULT_SERVER_CLI_LAYOUT_CANDIDATES` 时，会得到诚实的"不可用"而不是错误配置——但这种静默失配只有等用户反馈才会被发现。
