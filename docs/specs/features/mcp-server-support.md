# WeCode MCP Server 支持

## 目标

将 WeCode 作为 **MCP Server** 暴露给外部 AI 应用（Claude Desktop、Cursor、Continue 等），通过标准 MCP 协议调用 WeCode 的会话编排能力。

**Phase 1 聚焦本地 stdio 传输** — 无网络、无鉴权复杂性、进程隔离、最小可用产品。后续再考虑 HTTP+SSE 远程方案。

**核心原则**：最小暴露、零包装、复用现有能力。不新增业务逻辑，只做协议适配 + 官方 SDK 集成。

**协议边界**：所有会话创建/消息发送/读取走 **V4 协议命令面**（`createSession`、`sendText`、`compact`、`switchModelConfig` 等），通过现有 broker 反向请求路径（`task/*`、`session/*`、`permission/*`）到达 Host 侧 `IWeCodeTaskService`/`IWeCodeSessionService`。

---

## 范围

### In Scope（Phase 1 - stdio only）

| 能力 | MCP 工具名 | 复用现有（V4 路径） |
|------|-----------|------------------|
| 列出已知工作区 | `workspace_list` | `IWeCodeTaskService.listTasks` |
| 列出工作区下的会话 | `list_sessions` | `WeCodeSessionPort.listSessions` → `session/listSessions` |
| 创建会话 | `create_session` | `CreateSession` → `WeCodeTaskPort.createTask(v4Create=true)` → V4 `createSession` 命令 |
| 发送消息 | `send_session_message` | `SendSessionMessage` → `WeCodeTaskPort.sendPrompt` → V4 `sendText` 命令 |
| 读取会话 | `read_session` | `ReadSession` → `WeCodeSessionPort.readSession` → `session/readSession` |
| 停止生成 | `stop_session_generation` | `StopSessionGeneration` → `WeCodeTaskPort.stopGeneration` → V4 `stop` 命令 |
| 切换模型 | `set_session_model` | `SetSessionModel` → `WeCodeTaskPort.setModel` → V4 `switchModelConfig` 命令 |
| 压缩上下文 | `compact_session` | `CompactSession` → `WeCodeTaskPort.compactSession` → V4 `compact` 命令 |
| 审批委托 | `resolve_session_permission` | `ResolveSessionPermission` → `WeCodePermissionPort.resolvePermission` → `permission/resolveSessionPermission` |
| **传输层** | **stdio** | **官方 @modelcontextprotocol/sdk** |

### Out of Scope（明确延后）

- ❌ `workspace_ensure` / `workspace_discover` / `workspace_connect_remote` —— 工作区管理由用户 UI 完成 - ❌ 远程 HTTP+SSE 传输 —— Phase 2 单独特性（涉及鉴权、网络安全） - ❌ MCP Resources / Notifications / Prompts —— 资源访问走 `read_session`，通知走现有 `session/changed` - ❌ 多用户/多租户认证 —— Phase 2 企业级方案 - ❌ Legacy 协议路径 —— MCP 仅走 V4 命令面

---

## 架构设计

### 协议栈（本地 stdio）

```
Claude Desktop / Cursor / Continue (MCP Client)
       │
       └─ stdio (stdin/stdout)
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

### 9 个工具映射表

| MCP 工具名 | 内部名称 | Handler 来源 | 备注 |
|-----------|---------|-----------|------|
| `workspace_list` | WorkspaceList | `handlers/workspace-list.ts` | 本地 + 远程工作区列表 |
| `list_sessions` | ListSessions | `handlers/list-sessions.ts` | 工作区下的会话列表 |
| `create_session` | CreateSession | `handlers/create-session.ts` | 创建会话，触发 V4 `createSession` |
| `send_session_message` | SendSessionMessage | `handlers/send-session-message.ts` | 发送消息，触发 V4 `sendText` |
| `read_session` | ReadSession | `handlers/read-session.ts` | 读取会话结果 |
| `stop_session_generation` | StopSessionGeneration | `handlers/stop-session-generation.ts` | 停止生成 |
| `set_session_model` | SetSessionModel | `handlers/set-session-model.ts` | 切换模型 |
| `compact_session` | CompactSession | `handlers/compact-session.ts` | 压缩会话上下文 |
| `resolve_session_permission` | ResolveSessionPermission | `handlers/resolve-session-permission.ts` | 代审批 |

### 模块归属

| 模块 | 职责 | 文件 |
|------|------|------|
| `packages/server` | MCP 服务器入口 + 官方 SDK 集成 | `src/mcp/index.ts` |
| `packages/server` | Tool 适配器（ToolEntry → MCP Tool） | `src/mcp/tool-adapter.ts` |
| `apps/zcode-cli/packages/contracts` | Tool 契约 schema（复用） | `src/tools/ai-session-orchestration.ts` |
| `apps/zcode-cli/packages/core/src/tool/handlers` | 现有 Handler（零修改） | 9 个 handler 文件 |
| `packages/services` | 业务服务（零感知 MCP） | 现有文件 |

### 依赖关系

```
packages/server (mcp/)
    → @modelcontextprotocol/sdk@^1.32.0  (官方 SDK，JSON-RPC 2.0)
    → @zcode/contracts                   (tool schema)
    → @zcode/services                    (IWeCodeTaskService, IWeCodeSessionService)
    → 不反向依赖任何业务包
```

---

## 集成方案（官方 SDK + stdio）

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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { WeCodeTaskPort, WeCodeSessionPort, WeCodePermissionPort } from "@zcode/contracts";

export async function createMcpServer(deps: {
  weCodeTaskPort: WeCodeTaskPort;
  weCodeSessionPort: WeCodeSessionPort;
  weCodePermissionPort: WeCodePermissionPort;
  sessionId: string;  // 当前调用方会话 ID（from context）
}): Promise<Server> {
  const server = new Server({
    name: "WeCode MCP Server",
    version: "1.0.0",
  });

  // 1. 注册所有 9 个工具
  const tools = await registerAllTools(deps);
  
  // 2. 工具列表端点
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // 3. 工具调用端点
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
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

export async function runStdioServer(deps: {...}): Promise<void> {
  const server = await createMcpServer(deps);
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  // 官方 SDK 自动处理 stdin/stdout，一直运行到进程退出
}
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
    inputSchema: entry.inputSchema,  // 已是 JSON Schema
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

  const tools: Tool[] = handlers.map((handler) =>
    adaptToolToMcp(handler.entry, handler, context),
  );

  return tools;
}
```

### 3. CLI 集成

**`packages/zcode-server-cli/src/cli.ts`** 新增子命令：

```typescript
// 现有 imports ...
import { runStdioServer } from "@zcode/server/mcp/index.js";

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "mcp" && args[1] === "stdio") {
    // 获取当前 Host 的 ports（从现有 HTTP Host 复用）
    const host = await startHost();  // 现有逻辑
    
    // 启动 MCP stdio 服务器
    await runStdioServer({
      weCodeTaskPort: host.weCodeTaskPort,
      weCodeSessionPort: host.weCodeSessionPort,
      weCodePermissionPort: host.weCodePermissionPort,
      sessionId: generateSessionId(),  // MCP server 自己的会话标识
    });
    
    return;
  }

  // 现有的 http / other 子命令处理...
}
```

---

## 使用说明

### 外部客户端连接配置（后端生成）

MCP 的 stdio 形态是：外部客户端（Cherry Studio、Claude Desktop 等）**spawn** 本产品的 MCP server 作为子进程，通过该进程的 stdin/stdout 收发 JSON-RPC。因此配置文件里的 `command`/`args` 就是客户端 实际执行的启动命令——命令无法解析时进程不存在，客户端永远收不到 `initialize` 响应， 表现是"已连接但工具列表为空"。

**配置必须由宿主在运行时生成，UI 不得硬编码。** 原因：CLI 包未发布（`packages/zcode-server-cli` `private: true`），`npx zcode` 会命中 npm 上无关的占位包且该包没有 `bin` 入口， `npx --yes zcode mcp stdio` 实测 `exit 1`、stdout 0 字节。

实现：

- `packages/server/src/mcp/client-config.ts` — 纯函数生成器。 - `WECODE_MCP_SERVER_KEY = "wecode"`（server key / 模型侧可见标识） - `buildWeCodeMcpClientConfig({ node, serverCli })` → `{ mcpServers: { wecode: { command, args, env } } }` - `createWeCodeMcpClientConfigJson(...)` → 缩进 2、换行结尾的 JSON 文本 - `resolveWeCodeMcpEntrypoint()` → 从锚点向上查找 server-cli 入口，全部候选落空时返回 `ok: false`
    而不产出无效配置
- env 值一律字符串；仅注入 `ELECTRON_RUN_AS_NODE: "1"`（与 `official-plugin-runtime.ts` 同一约定，
    桌面打包态 `process.execPath` 是 Electron Helper，缺该 env 会误进 Electron main）
- 桌面宿主通过**既有通道** `PlatformChannels.LoadMcpFromUserDirectory` 下发，不新增 IPC： `LoadCliMcpFromUserDirectoryResult` 增加只读字段 `builtinServers` / `builtinMcpClientConfigJson`。 生成失败返回空对象，不影响既有的用户 MCP 列表读取。 - `packages/ui/src/settings/McpConfigDisplay.tsx` 只读取并展示，缺失时显示不可用提示。

生成物形态（示例，路径由本机解析）：

```json
{
  "mcpServers": {
    "wecode": {
      "command": "/path/to/node",
      "args": ["/path/to/server-cli.js", "mcp", "stdio"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

**不变量**：内置配置只读生成、不落盘。写进用户 MCP 目录（`~/.zcode/cli/config.json`）会让 agent 把本产品自己当外部 MCP server 拉起来，属于自引用，因此必须只走展示路径。

### 工作流

1. 用户在设置页开启 MCP，复制后端生成的配置 JSON，粘贴到外部客户端
2. 外部客户端 spawn `node <server-cli> mcp stdio`
3. 客户端发送 `initialize`，获得 `capabilities.tools` 与 9 个工具
4. 客户端调用 `workspace_list` → 获得工作区
5. 客户端调用 `create_session` → 返回 `taskId`
6. 客户端调用 `send_session_message` → 发送初始指令
7. 客户端轮询 `read_session` → 获取结果
8. 完成

---

## 工具契约（复用现有）

所有 9 个工具的 input/output schema 直接来自 `packages/contracts/src/tools/ai-session-orchestration.ts`，零修改。

### 关键字段

- **`workspace_list`**：无参数，返回本地 + 远程工作区列表 - **`list_sessions`**：`workspaceIdentity` + `workspacePath` (可选) + `includeArchived` + `limit` - **`create_session`**：`workspacePath` (必填) + `mode` + `modelSelection` 等 - **`send_session_message`**：`sessionId` + `traceId` (必填，用于幂等) + `text` - **其他 6 个**：透传现有 schema，无变更

---

## 验收场景

| 场景 | 步骤 | 预期结果 |
|------|------|--------|
| **本地 stdio 完整流程** | Claude Desktop 配置后 → 调用 `workspace_list` → 创建会话 → 发送消息 → 读取结果 | 9 个工具全部可用，V4 协议命令正常执行，会话独立运行 |
| **错误处理** | 调用不存在的工作区 → 发送到错误会话 | MCP error response 正确返回，调用方能识别错误类型 |
| **并发工具调用** | 同时创建 3 个会话 + 各自发消息 | 每个会话独立状态，互不干扰 |

---

## 实现清单

### Phase 1（本地 stdio）

- [ ] 添加 `@modelcontextprotocol/sdk@^1.32.0` 到 packages/server - [ ] 实现 `packages/server/src/mcp/index.ts` — 服务器入口 - [ ] 实现 `packages/server/src/mcp/tool-adapter.ts` — 工具适配器 - [ ] 实现 `packages/server/src/mcp/tool-registry.ts` — 工具注册 - [ ] 实现 `packages/zcode-server-cli/src/mcp-stdio.ts` — stdio 启动逻辑 - [ ] 更新 `packages/zcode-server-cli/src/cli.ts` — 新增 `mcp stdio` 子命令 - [ ] 编译验证：`pnpm build` - [ ] 手工验证：Claude Desktop 配置 + 调用完整流程

### Phase 2（延后）

- [ ] 远程 HTTP+SSE 传输（涉及网络安全、鉴权） - [ ] MCP Resources / Notifications - [ ] 多工作区会话隔离验证

---

## 依赖与风险

### 无新增风险

- ✅ 官方 @modelcontextprotocol/sdk 成熟稳定（Anthropic 维护） - ✅ 现有 handler 零修改，stdio 只是传输层 - ✅ 本地进程隔离，无网络暴露 - ✅ 错误处理已由 SDK 标准化

### 依赖检查

- ✅ `WeCodeTaskPort` / `WeCodeSessionPort` 端口已稳定 - ✅ 9 个 handler 已实现并通过测试 - ✅ 现有契约 schema 无需变更 - ✅ packages/server 已能构建

---

## 命名迁移说明

本文档正式切换为 **WeCode** 命名体系：

- `ZCode` → `WeCode` - `ZCodeTaskService` → `WeCodeTaskService` - `ZCodeSessionService` → `WeCodeSessionService` - `ZCodeTaskPort` → `WeCodeTaskPort` - 等等...

后续 PR 会同步更新源代码中的命名。

---

## 备注

- **不修改** `apps/zcode-cli/packages/core/src/tool/handlers/` 任何现有文件 - **不修改** `packages/services` 任何业务逻辑 - **不新增** `packages/shared` 协议类型 - **所有新代码** 集中在 `packages/server/src/mcp/` 与 `packages/zcode-server-cli/src/` 的 MCP 相关文件 - **官方 SDK 即真理**：所有 JSON-RPC 2.0 细节由 `@modelcontextprotocol/sdk` 自动处理，我们只适配工具
