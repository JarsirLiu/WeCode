# WeCode MCP Server 支持

## 目标

将 WeCode 作为 **MCP Server** 暴露给外部 AI 应用（Claude Desktop、Cursor、Continue 等），通过标准 MCP 协议调用 WeCode 的会话编排能力。

**正式主路径采用 MCP Streamable HTTP** — 外部客户端通过 HTTPS 连接 WeCode MCP Gateway，或连接已启动桌面端提供的本地 MCP HTTP endpoint；不要求用户安装独立 MCP 包。stdio 不属于产品支持范围。

**核心原则**：最小暴露、单一业务所有者、复用现有 Host/服务能力。MCP 适配器只负责协议转换和连接管理，不复制 session/task 状态，不直接实现第二套会话业务逻辑。

**本地端口**：MCP 使用 WeCode 专用固定 loopback 端口 `39173`，外部 Agent 配置跨重启保持有效；普通 Host/RPC 仍使用动态端口。可通过 `WECODE_MCP_PORT` 覆盖，端口占用时必须报告冲突，不得静默改用随机端口。

**启用开关**：`AppSettings.mcpEnabled` 是 MCP 对外配置的唯一 UI 状态所有者，缺省按开启兼容既有用户。设置页开启时展示桌面宿主实时生成的 JSON；关闭时隐藏配置且不生成可复制配置。开关状态通过现有设置服务持久化，不复制到 MCP store 或用户 MCP server 列表。

**运行时就绪**：设置页只能展示当前可连接的 MCP endpoint。桌面主进程生成配置前对固定 endpoint 执行本地健康探测；listener 未启动、Host 未 ready、端口冲突或开关关闭时返回不可用，不展示指向未监听地址的 JSON。健康探测使用同一 `/mcp` 路径的 `HEAD` 请求，不创建 MCP session；正式客户端仍只使用 `POST /mcp` 的 Streamable HTTP 协议。

**协议边界**：所有会话创建/消息发送/读取走 **V4 协议命令面**（`createSession`、`sendText`、`compact`、`switchModelConfig` 等），通过现有 broker 反向请求路径（`task/*`、`session/*`、`permission/*`）到达 Host 侧 `IWeCodeTaskService`/`IWeCodeSessionService`。

**外部配置格式**：唯一复制配置必须显式声明 `type: "streamable_http"` 和 `url`。不能只依赖仅支持简写 URL 的客户端默认推断；Cherry Studio 等客户端在缺少类型时可能按 stdio 处理。配置仍只包含一个 `mcpServers.wecode` 条目。

**MCP 服务版本**：MCP serverInfo 的 WeCode 服务版本固定为 `0.1.0`，表示首个对外 HTTP MCP 契约版本；它独立于桌面应用版本和 MCP 协议版本。后续不兼容的工具或调用契约变更必须升级主版本。

**发布门槛**：仅能完成 `initialize` 或 `tools/list` 不算 MCP 可用。正式 HTTP 路径只有在外部客户端无需本地源码、Electron 或独立安装包即可连接，鉴权和 workspace 授权有效，9 个工具的 `tools/call` 均能到达真实 Host/后端服务并返回结果，关闭开关能在运行时拒绝新连接/调用后，才允许标记为完成。

---

## 范围

### In Scope（Phase 1 - Streamable HTTP only）

| 能力               | MCP 工具名                   | 复用现有（V4 路径）                                                                                           |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 列出已知工作区     | `workspace_list`             | `ISettingService.listWorkspaces`                                                                              |
| 列出工作区下的会话 | `list_sessions`              | `WeCodeSessionPort.listSessions` → `session/listSessions`                                                     |
| 创建会话           | `create_session`             | `CreateSession`（使用 Host 默认模型）→ `WeCodeTaskPort.createTask(v4Create=true)` → V4 `createSession` 命令 |
| 发送消息           | `send_session_message`       | `SendSessionMessage` → `WeCodeTaskPort.sendPrompt` → V4 `sendText` 命令                                       |
| 读取会话           | `read_session`               | `ReadSession` → `WeCodeSessionPort.readSession` → `session/readSession`                                       |
| 停止生成           | `stop_session_generation`    | `StopSessionGeneration` → `WeCodeTaskPort.stopGeneration` → V4 `stop` 命令                                    |
| 切换模型           | `set_session_model`          | `SetSessionModel` → `WeCodeTaskPort.setModel` → V4 `switchModelConfig` 命令                                   |
| 压缩上下文         | `compact_session`            | `CompactSession` → `WeCodeTaskPort.compactSession` → V4 `compact` 命令                                        |
| 审批委托           | `resolve_session_permission` | `ResolveSessionPermission` → `WeCodePermissionPort.resolvePermission` → `permission/resolveSessionPermission` |
| **传输层**         | **Streamable HTTP**          | **官方 @modelcontextprotocol/sdk**                                                                            |

### Out of Scope（明确延后）

- ❌ `workspace_ensure` / `workspace_discover` / `workspace_connect_remote` —— 工作区管理由用户 UI 完成 - ❌ MCP Resources / Notifications / Prompts —— 资源访问走 `read_session`，通知走现有 `session/changed` - ❌ 未鉴权的公网本地 Host 端口 - ❌ Legacy 协议路径 —— MCP 仅走 V4 命令面

---

## 架构设计

### 协议栈（Streamable HTTP）

```
Claude / Cursor / Continue (MCP Client)
       │
       └─ HTTPS + MCP Streamable HTTP
              ↓
       ┌──────────────────────────────┐
       │   @modelcontextprotocol/sdk  │  (JSON-RPC 2.0 自动处理)
       │   - tools/list               │
       │   - tools/call               │
       │   - initialize               │
       └───────────┬──────────────────┘
                   │
                   ▼
       ┌──────────────────────────────┐
       │   Tool Adapter Layer         │  (ToolEntry → MCP Tool)
       │   - 9 个工具注册             │
       │   - handler context 注入      │
       └───────────┬──────────────────┘
                   │
       ┌───────────┴───────────────┐
       ▼                           ▼
  WeCodeTaskPort            WeCodeSessionPort
  WeCodePermissionPort      (现有 broker 反向请求)
       │                           │
       └───────────┬───────────────┘
                   ▼
       ┌──────────────────────────────┐
       │   Host 侧执行桥              │
       │   - V4 CommandInbox admission│
       │   - session runtime          │
       └──────────────────────────────┘
```

**真实进程边界（发布实现必须遵守）**：外部 Agent 连接的是 MCP HTTP endpoint，不启动 Electron、Node 子进程或独立 MCP 安装包。HTTP adapter 使用官方 SDK 处理 JSON-RPC，再通过受保护的 Host RPC 或后端服务连接现有会话运行时；Host/后端是 session/task/permission 的唯一事实源。HTTP adapter 不得复制会话队列或直接 import Desktop 实现。

HTTP endpoint 的生命周期由桌面 Host 或云端 Gateway 管理；客户端断开只释放 HTTP/MCP session，不得终止共享 Host 或其他窗口会话。Host 不可用时，endpoint 返回稳定的可诊断错误，不在 HTTP 请求中盲目启动第二套业务运行时。

### MCP Host Control Contract v1

HTTP MCP 不使用本地 `connect-or-start` 或稳定 launcher。桌面端 endpoint 只连接当前窗口 Host；云端 endpoint 连接后端 Host。Host 不可用时返回稳定 HTTP/MCP 错误，不在请求中启动第二套业务运行时。

稳定错误码为：`WECODE_MCP_HOST_UNAVAILABLE`、`WECODE_MCP_AUTH_REQUIRED`、`WECODE_MCP_WORKSPACE_FORBIDDEN`、`WECODE_MCP_DISABLED`。HTTP 客户端断开只释放 MCP session，不会停止 Host；Host 重启会使已有 MCP session 失效，客户端必须重新建立 HTTP MCP session。

### 9 个工具映射表

| MCP 工具名                   | 内部名称                 | Host port / 命令来源                       | 备注                    |
| ---------------------------- | ------------------------ | ------------------------------------------ | ----------------------- |
| `workspace_list`             | WorkspaceList            | `ISettingService.listWorkspaces`           | 本地 + 远程工作区列表   |
| `list_sessions`              | ListSessions             | `WeCodeSessionPort.listSessions`           | 工作区下的会话列表      |
| `create_session`             | CreateSession            | `WeCodeTaskPort.createTask(v4Create=true)` | 触发 V4 `createSession` |
| `send_session_message`       | SendSessionMessage       | `WeCodeTaskPort.sendPrompt`                | 触发 V4 `sendText`      |
| `read_session`               | ReadSession              | `WeCodeSessionPort.readSession`            | 读取会话结果            |
| `stop_session_generation`    | StopSessionGeneration    | `WeCodeTaskPort.stopGeneration`            | 停止生成                |
| `set_session_model`          | SetSessionModel          | `WeCodeTaskPort.setModel`                  | 切换模型                |
| `compact_session`            | CompactSession           | `WeCodeTaskPort.compactSession`            | 压缩会话上下文          |
| `resolve_session_permission` | ResolveSessionPermission | `WeCodePermissionPort.resolvePermission`   | 代审批                  |

### 模块归属

| 模块                                   | 职责                                    | 文件                                    |
| -------------------------------------- | --------------------------------------- | --------------------------------------- |
| `packages/server`                      | MCP 协议入口 + 官方 SDK 集成            | `src/mcp/index.ts`                      |
| `packages/server`                      | Tool 适配器（MCP Tool → Host port）     | `src/mcp/tool-adapter.ts`               |
| `apps/zcode-cli/packages/contracts`    | Tool 契约 schema（复用）                | `src/tools/ai-session-orchestration.ts` |
| `packages/desktop` / `packages/server` | HTTP MCP endpoint、鉴权和 Host RPC 连接 | `src/mcp/*`、Host HTTP 装配             |
| `packages/services` / Desktop Host     | 会话、任务、权限唯一事实源              | 现有公开 service/Host port              |

### 依赖关系

```
packages/server (mcp/)
    → @modelcontextprotocol/sdk@^1.32.0  (官方 SDK，JSON-RPC 2.0)
    → @zcode/contracts                   (工具 schema)
    → Host public RPC/port contract       (不直接导入 Desktop 实现)
    → 不复制 session/task 业务状态
```

---

## 集成方案（官方 SDK + Streamable HTTP）

### 1. 依赖更新

**`packages/server/package.json`** 新增：

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.32.0"
  }
}
```

### 2. 核心实现文件

#### `packages/server/src/mcp/index.ts` — 入口

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { WeCodeTaskPort, WeCodeSessionPort, WeCodePermissionPort } from "@zcode/contracts";

export async function createMcpServer(deps: {
  weCodeTaskPort: WeCodeTaskPort;
  weCodeSessionPort: WeCodeSessionPort;
  weCodePermissionPort: WeCodePermissionPort;
  sessionId: string; // 当前调用方会话 ID（from context）
}): Promise<Server> {
  const server = new Server({
    name: "WeCode MCP Server",
    version: "0.1.0",
  });

  // 1. 注册所有 9 个工具
  const tools = await registerAllTools(deps);

  // 2. 工具列表端点
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // 3. 工具调用端点
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${request.params.name}`);
    }

    // 调用对应 handler
    const result = await callToolHandler(tool, request.params.arguments, deps);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  return server;
}

// MCP stdio transport is intentionally not part of the product contract.
```

#### `packages/server/src/mcp/tool-adapter.ts` — Tool 适配器

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolEntry, ToolHandler } from "@zcode/contracts";

/**
 * 将 WeCode ToolEntry 适配为 MCP Tool
 * - 输入：直接透传给 handler
 * - 输出：handler 返回值作为 result
 * - 错误：CoreError → MCP error response
 */
export function adaptToolToMcp(
  entry: ToolEntry,
  handler: ToolHandler,
  context: ToolExecutionContext,
): Tool {
  return {
    name: entry.metadata.name,
    description: entry.metadata.description,
    inputSchema: entry.inputSchema, // 已是 JSON Schema
  };
}

/**
 * 调用 tool handler，处理错误
 */
export async function callToolHandler(
  tool: Tool,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<unknown> {
  try {
    // 构造 ToolExecutionContext（包含 zcodeTaskPort 等）
    const result = await handler(args, context);
    return result;
  } catch (err) {
    if (err instanceof CoreError) {
      return {
        error: err.message,
        type: err.errorType,
        recoverable: err.recoverable,
      };
    }
    throw err;
  }
}
```

#### `packages/server/src/mcp/tool-registry.ts` — 工具注册

```typescript
import { workspaceListHandler } from "@zcode/core/handlers/workspace-list.js";
import { listSessionsHandler } from "@zcode/core/handlers/list-sessions.js";
// ... 其他 7 个 handler

export async function registerAllTools(deps: {
  weCodeTaskPort: WeCodeTaskPort;
  weCodeSessionPort: WeCodeSessionPort;
  weCodePermissionPort: WeCodePermissionPort;
  sessionId: string;
}): Promise<Tool[]> {
  const context: ToolExecutionContext = {
    sessionId: deps.sessionId,
    weCodeTaskPort: deps.weCodeTaskPort,
    weCodeSessionPort: deps.weCodeSessionPort,
    weCodePermissionPort: deps.weCodePermissionPort,
    toolCallId: generateTraceId(),
    // ... 其他必需字段
  };

  const handlers = [
    workspaceListHandler,
    listSessionsHandler,
    createSessionHandler,
    sendSessionMessageHandler,
    readSessionHandler,
    stopSessionGenerationHandler,
    setSessionModelHandler,
    compactSessionHandler,
    resolveSessionPermissionHandler,
  ];

  const tools: Tool[] = handlers.map((handler) => adaptToolToMcp(handler.entry, handler, context));

  return tools;
}
```

### 3. HTTP endpoint 集成

桌面端和云端复用现有 HTTP/Host 装配，提供 MCP Streamable HTTP endpoint。endpoint 只负责 MCP JSON-RPC transport、鉴权、workspace/session scope 和 Host public port 转发，不创建新的 task/session runtime。桌面端默认绑定 loopback；云端通过 HTTPS Gateway 提供远程访问。MCP stdio adapter、`mcp stdio` CLI 子命令和独立 launcher 均已移除，不属于本产品支持范围。

```text
HTTP request -> MCP Streamable HTTP transport -> auth/workspace scope
             -> Host public ports -> V4 task/session/permission services
```

---

## 使用说明

### 外部客户端连接配置（宿主生成）

MCP 的正式形态是：外部客户端（Cherry Studio、Claude Desktop 等）通过 HTTPS 连接 MCP endpoint，使用 MCP Streamable HTTP 收发 JSON-RPC。客户端不需要 spawn WeCode 进程，也不需要安装 Node、Electron 或独立 launcher。

**配置必须由宿主在运行时生成，UI 不得硬编码。** 配置只指向 HTTPS MCP endpoint，不包含 Electron、Node、server-cli、仓库绝对路径或本地进程命令。

实现：

- `packages/server/src/mcp/client-config.ts` — 纯函数生成器。 - `WECODE_MCP_SERVER_KEY = "wecode"`（server key / 模型侧可见标识） - `buildWeCodeMcpClientConfig({ url, headers })` → `{ mcpServers: { wecode: { type: "streamable_http", url, headers } } }` - `createWeCodeMcpClientConfigJson(...)` → 缩进 2、换行结尾的 JSON 文本 - 不解析 Electron、Node、server-cli 或源码路径
  而不产出无效配置
- headers 只允许注入短期、可撤销的用户访问令牌或配对凭据；不得把 API key 写入日志、持久化配置或静态示例。
- 桌面宿主通过**既有通道** `PlatformChannels.LoadMcpFromUserDirectory` 下发，不新增 IPC： `LoadCliMcpFromUserDirectoryResult` 增加只读字段 `builtinServers` / `builtinMcpClientConfigJson`。 生成失败返回空对象，不影响既有的用户 MCP 列表读取。 - `packages/ui/src/settings/McpConfigDisplay.tsx` 只读取并展示，缺失时显示不可用提示。

**配置数量与稳定性规则**：WeCode 只提供一份规范 HTTP 配置，不提供“生成新配置”或配置历史列表。配置中的 server key 固定为 `wecode`，URL 指向稳定的 MCP endpoint；JSON 不包含时间戳、随机 ID 或本地路径。用户可以把同一份 JSON 分别粘贴到多个外部 Agent，这是各外部 Agent 的独立配置，不属于 WeCode 的多实例配置。

外部 Agent 已存在同名 `wecode` 配置时，产品说明必须指导用户覆盖/更新该条配置，而不是追加同名条目。若运行环境路径发生变化，旧客户端配置不会自动更新，用户需要用设置页当前唯一 JSON 替换旧的 `wecode` 条目；关闭开关只停止 WeCode 设置页展示，不会远程删除外部 Agent 已保存的副本。

### 发布实现契约

以下项目全部完成前，MCP 只能标记为开发预览，不能宣称支持外部 Agent：

1. **HTTP endpoint**：桌面端和云端均提供标准 Streamable HTTP MCP endpoint，不要求外部 Agent 安装本地运行时。
2. **HTTP 鉴权与授权**：身份、workspaceIdentity、sessionId 和租约信息必须由 Gateway/Host 校验，禁止仅凭 URL 参数授权。
3. **真实工具桥接**：9 个 `tools/call` 必须映射到 Host/后端公开 task/session/permission ports，沿用现有 V4 admission、owner/lease、幂等和 workspace identity 规则。
4. **开关运行时门禁**：`AppSettings.mcpEnabled` 由 Host/Gateway 读取并在握手及每次调用前校验。关闭后不得接受新 MCP session 或新工具调用。
5. **网络边界**：公网 Gateway 必须使用 HTTPS、短期凭据、workspace ACL 和审计；桌面端本地 endpoint 默认仅 loopback，不得暴露未鉴权公网端口。
6. **生命周期**：HTTP session 断开、Host 重启、重复连接和并发调用都必须有确定行为；HTTP session 释放不得杀死共享 Host。
7. **发布验证**：使用 Claude Desktop/兼容 MCP HTTP harness 完成 `initialize`、`tools/list` 和全部 9 个 `tools/call`，验证无需 Electron、源码路径、独立安装包和密钥明文。

生成物形态（示例）：

```json
{
  "mcpServers": {
    "wecode": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <short-lived-token>"
      }
    }
  }
}
```

**不变量**：内置配置只读生成、不落盘。写进用户 MCP 目录（`~/.zcode/cli/config.json`）会让 agent 把本产品自己当外部 MCP server 拉起来，属于自引用，因此必须只走展示路径。

### 工作流

1. 用户在设置页开启 MCP，复制后端生成的唯一 HTTP 配置 JSON，粘贴到外部客户端
2. 外部客户端通过 HTTPS 连接 MCP endpoint，并完成 MCP `initialize`
3. Gateway/桌面 Host 校验身份、workspace 授权和 `mcpEnabled`
4. 客户端发送 `initialize`，获得 `capabilities.tools` 与 9 个工具
5. 客户端调用 `workspace_list` → 适配器经 Host `ISettingService.listWorkspaces()` public port 获得工作区索引；不得读取环境变量或 MCP 进程本地缓存
6. 客户端调用 `create_session` → Host 创建会话并立即提交必填 `message`；默认使用 yolo
7. 客户端调用 `send_session_message` / `read_session` → 仅凭 `sessionId` 由 Host 解析会话归属并复用 V4 会话运行时
8. 关闭 MCP 后，新连接和新工具调用均得到明确的 disabled 错误；已有连接在安全边界处终止

### 开关验收

- 首次使用或缺失旧字段时，MCP 开关默认开启且可点击。
- 点击关闭后，`AppSettings.mcpEnabled` 持久化为 `false`，配置 JSON 区域消失；重新打开设置仍保持关闭。
- 点击开启后，配置 JSON 重新从桌面主进程生成并展示；生成失败只显示不可用提示，不伪造启动命令。
- 配置唯一性：连续打开设置页或重复开启开关，展示的 JSON 只有一个 `mcpServers.wecode` 条目，不出现历史/随机条目；复制到不同外部 Agent 时，各客户端均按 `wecode` 条目覆盖更新。

---

## 工具契约与适配边界

MCP 与应用内 AI 共用 Host task/session/permission 服务及会话运行时，但不是同一个工具调用上下文。MCP 的公开输入 schema 定义在 `apps/zcode-cli/packages/contracts/src/tools/mcp-session-orchestration.ts`，供 MCP `tools/list` 展示并在 `tools/call` 时运行时校验；应用内 AI 继续使用 `ai-session-orchestration.ts` 的 `ToolEntry`，由 `ToolExecutor` 处理调用方会话、权限、取消、超时和结果预算。两个 surface 可有不同参数名称和可见字段，不能通过直接调用 AI handler 或未经校验地透传参数来“复用”。

共用的是 Host 业务事实源和操作语义：两者最终调用相同的 task/session/permission 服务，创建、消息 admission、读取、停止、切模型、压缩和审批不得在 MCP 中另写一套运行时逻辑。

### 关键字段

- **`workspace_list`**：无参数，返回本地 + 远程工作区列表
- **`list_sessions`**：`workspacePath`（必填）+ `workspaceIdentity`（远程工作区可选）+ `includeArchived` + `limit`
- **`create_session`**：`workspacePath`（必填）+ `message`（必填）+ `mode` + `modelSelection`；未指定 mode 时使用 yolo
- **`send_session_message`**：`sessionId` + `message`；可选 `traceId` 仅用于链路观测，不是幂等键；workspace 由 Host 按 session 解析
- **`read_session`**：`sessionId` 为目标会话；可选 `messageLimit` 和 `afterSeq` 必须透传给 Host session service
- **`stop_session_generation`、`set_session_model`、`compact_session`、`resolve_session_permission`**：`sessionId` 为目标会话，workspace 由 Host 按 session 解析；客户端不需要重复传路径

`set_session_model` 接受 `model`（`provider/model` picker 格式）或结构化 `modelSelection`，至少提供其一；旧 V4 compact 命令不接受 `instructions`，因此 MCP schema 不暴露该参数。权限选项 `allow_once`/`allow_always` 映射到 V4 `allow`，`deny` 映射到 V4 `deny`，原 option id 仍用于精确匹配当前审批请求。

### Workspace list public port

`ISettingService.listWorkspaces()` 是 Host 持有的只读索引 Port。返回值只包含 MCP 所需的脱敏摘要：`kind`、`workspacePath`、可选的 `workspaceIdentity`、展示 `label`、以及远程连接状态；不返回 SSH、token、credential key 或 remote target 细节。索引由 Host 设置事实源生成：优先合并 `lastWorkspaceSession`（本地与远程），再补充 `recentProjects` 中未出现的本地路径，并按 workspace identity 去重。MCP 适配器不得通过环境变量或自身进程状态补充列表。

会话创建后，`IZCodeTaskService.resolveTaskTarget({ taskId })` 是会话归属的 Host public port。它从 Host 的 task index 解析 `workspacePath`/`workspaceIdentity`，后续会话工具统一使用该目标；工具 schema 不要求调用方传路径。找不到目标或 workspace 不在 Host 索引中，统一返回 `WECODE_MCP_WORKSPACE_FORBIDDEN`。

`create_session.message` 必须沿同一 Host task service 提交一次 `sendPrompt`；提交失败时 MCP 调用失败，不返回一个假装已完成的空会话。MCP 和应用内 AI 不暴露 approvalPolicy；权限审批与会话管理授权另行设计。

身份规则：应用内 AI 的 `ToolExecutionContext.sessionId` 是发起工具调用的受信会话；跨会话参数使用 `targetSessionId` 或目标 `taskId`，Host broker 从受信 session record 注入 workspace、workspaceIdentity、remoteSessionId 和 clientMode。MCP 的 `sessionId` 则直接表示外部客户端要管理的目标会话；Host 必须通过 `resolveTaskTarget` 解析其 workspace 并执行 ACL，不信任调用方附加的路由字段。

MCP handler 必须按公开 schema 拒绝缺失、错误或未知字段，不得猜测别名、从当前目录补 workspace、或切换到另一套工具实现。每个公开的可选参数都必须传到对应 Host service；未支持的参数不得出现在 `tools/list` schema 中。

**不变量**：同一 Host 设置快照下，相同 `workspaceIdentity?.trim() || workspacePath` 只出现一次；列表为空是合法结果，不伪造当前工作目录。

---

## 验收场景

| 场景              | 步骤                                                                                | 预期结果                                            |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| **HTTP 完整流程** | Claude Desktop 配置 URL 后 → 调用 `workspace_list` → 创建会话 → 发送消息 → 读取结果 | 9 个工具全部可用，V4 协议命令正常执行，会话独立运行 |
| **错误处理**      | 调用不存在的工作区 → 发送到错误会话                                                 | MCP error response 正确返回，调用方能识别错误类型   |
| **并发工具调用**  | 同时创建 3 个会话 + 各自发消息                                                      | 每个会话独立状态，互不干扰                          |

---

## 实现清单

### Phase 1（Streamable HTTP，发布前必须全部完成）

- [ ] 保留 `@modelcontextprotocol/sdk@^1.32.0` 并锁定兼容版本
- [ ] 实现 `packages/server/src/mcp/index.ts`、tool adapter、tool registry
- [x] 实现桌面端和云端 Streamable HTTP endpoint，并复用 Host public ports
- [x] HTTP 握手及每次调用前读取 `AppSettings.mcpEnabled`
- [x] 将 `AppSettings.mcpEnabled` 门禁放在 Host/适配器运行时，不只控制 UI
- [x] 不增加桌面端/CLI 安装包体积，不新增 MCP 安装产物；正式 JSON 只包含 HTTP endpoint 和鉴权方式
- [x] 增加无密钥 MCP harness：initialize、tools/list、9 个 Host bridge tools/call、disabled、workspace ACL
- [ ] staging 仍需验收 Host 重启、端口冲突、并发连接和外部 Agent
- [ ] 在无安装包、无 Electron 子进程的 staging 环境执行 MCP HTTP harness，再进行 Claude Desktop/兼容客户端手工验证
- [ ] `pnpm build`、`pnpm typecheck`、`pnpm lint`、架构/文档门禁全部通过

### Phase 2（延后）

- [ ] MCP Resources / Notifications - [ ] 多工作区会话隔离验证 - [ ] 多租户组织级策略

---

## 依赖与风险

### 当前已知风险与阻断

- ✅ `createHostMcpToolHandler` 已连接 `ISettingService`、`IZCodeTaskService` 和 `IZCodeSessionService`，9 个工具均通过 Host public service bridge
- ✅ MCP stdio adapter、CLI 子命令和 Electron MCP 配置路径已移除；普通 Desktop/Host stdio 仍是内部 RPC，不是 MCP 产品路径
- ✅ 开关在 HTTP handler 和 Host tool handler 两层运行时校验；关闭后健康探测、握手和工具调用均拒绝
- ⚠️ HTTP endpoint 的短期鉴权凭据、Host 重启后的客户端重连和外部客户端兼容性仍需 staging 验收
- ✅ 官方 `@modelcontextprotocol/sdk` 负责 JSON-RPC 细节，但不负责业务 handler、进程生命周期或权限

### 依赖检查

- ✅ Host 侧通过公开 service contract 执行 task/session/permission 操作；MCP adapter 不复制业务状态
- ✅ 9 个 MCP handler 已通过无密钥 Host bridge 回放及 loopback listener 握手验证；仍需 staging 进程级重启、并发和外部客户端验收
- ⚠️ 现有工具 schema 可复用，但 workspace identity、owner/lease、幂等错误必须逐项映射
- ✅ `packages/server` 当前可构建；这只证明协议壳可编译，不代表 MCP 业务已发布可用

---

## 命名迁移说明

本文档正式切换为 **WeCode** 命名体系：

- `ZCode` → `WeCode` - `ZCodeTaskService` → `WeCodeTaskService` - `ZCodeSessionService` → `WeCodeSessionService` - `ZCodeTaskPort` → `WeCodeTaskPort` - 等等...

后续 PR 会同步更新源代码中的命名。

---

## 备注

- **不修改** `apps/zcode-cli/packages/core/src/tool/handlers/` 任何现有文件 - **不修改** `packages/services` 任何业务逻辑 - **不新增** `packages/shared` 协议类型 - **所有新代码** 集中在 `packages/server/src/mcp/` 与现有 HTTP/Host 装配层 - **不新增 MCP 安装产物**：必须复用现有桌面端/云端服务进程，不能增加桌面端或 CLI 构建体积 - **官方 SDK 即真理**：所有 JSON-RPC 2.0 细节由 `@modelcontextprotocol/sdk` 自动处理，我们只适配工具
