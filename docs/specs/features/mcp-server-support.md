# MCP Server 支持

## 目标

将 ZCode 作为 **MCP Server** 暴露，让外部 Agent 应用（Claude Desktop、Cursor、Continue 等）通过标准 MCP 协议调用 ZCode 的会话编排能力。

**核心原则**：最小暴露、零包装、复用现有能力。不新增业务逻辑，只做协议适配。

**协议边界**：所有会话创建/消息发送/读取走 **V4 协议命令面**（`createSession`、`sendText`、`compact`、`switchModelConfig` 等），通过现有 broker 反向请求路径（`task/*`、`session/*`、`permission/*`）到达 Host 侧 `IZCodeTaskService`/`IZCodeSessionService`。Legacy 协议路径仅作兼容兜底，**MCP Server 仅暴露 V4 路径能力**。

---

## 范围

### In Scope

| 能力               | MCP 映射                           | 复用现有（V4 路径）                                                                                          |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 列出已知工作区     | `tools/workspace_list`             | `IZCodeTaskService.listTasks` + `windowRemoteConnectionRegistry`                                             |
| 列出工作区下的会话 | `tools/list_sessions`              | `ZCodeSessionPort.listSessions` → `session/listSessions`                                                     |
| 创建会话           | `tools/create_session`             | `CreateSession` → `ZCodeTaskPort.createTask(v4Create=true)` → V4 `createSession` 命令                        |
| 发送消息           | `tools/send_session_message`       | `SendSessionMessage` → `ZCodeTaskPort.sendPrompt` → V4 `sendText` 命令                                       |
| 读取会话           | `tools/read_session`               | `ReadSession` → `ZCodeSessionPort.readSession` → `session/readSession`                                       |
| 停止生成           | `tools/stop_session_generation`    | `StopSessionGeneration` → `ZCodeTaskPort.stopGeneration` → V4 `stop` 命令                                    |
| 切换模型           | `tools/set_session_model`          | `SetSessionModel` → `ZCodeTaskPort.setModel` → V4 `switchModelConfig` 命令                                   |
| 压缩上下文         | `tools/compact_session`            | `CompactSession` → `ZCodeTaskPort.compactSession` → V4 `compact` 命令                                        |
| 审批委托           | `tools/resolve_session_permission` | `ResolveSessionPermission` → `ZCodePermissionPort.resolvePermission` → `permission/resolveSessionPermission` |
| 传输层             | stdio + HTTP+SSE                   | 新增 MCP 协议处理                                                                                            |

### Out of Scope（显式不做）

- ❌ `workspace_ensure` / `workspace_discover` / `workspace_connect_remote` —— 工作区创建/发现/远程连接由用户在 UI 侧完成，或后续独立特性
- ❌ `run_task` 隐式单轮任务工具 —— 组合逻辑留给客户端，不在 Server 侧封装
- ❌ MCP Resources / Notifications / Prompts —— Phase 1 只做 Tools，资源访问走 `read_session`，通知走现有 `session/changed` 机制
- ❌ 认证/授权体系 —— 复用现有 `ZCODE_SERVER_TOKEN` 简单 token 保护，企业级 auth 留 Phase 2
- ❌ 租户/配额/计费 —— 非本特性范围
- ❌ Legacy 协议路径（`session/create`、`session/send`、`session/compact`、`session/setModel`） —— MCP 仅走 V4 命令面

---

## 架构设计

### 协议栈

```
外部 Agent (MCP Client)
       │
       ├── stdio ──────────────────────► MCP Server (ZCode)
       │
       └── HTTP+SSE (/mcp) ───────────► MCP Server (ZCode)
                    │
                    ▼
         ┌────────────────────────┐
         │   MCP Protocol Layer   │  (JSON-RPC 2.0, tools/call, tools/list, initialize)
         └───────────┬────────────┘
                     │
                     ▼
         ┌────────────────────────┐
         │   Tool Router          │  (name → handler 映射)
         └───────────┬────────────┘
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
  ZCodeTaskPort              ZCodeSessionPort
  ZCodePermissionPort        (现有 broker 反向请求路径)
         │                        │
         └───────────┬────────────┘
                     ▼
         ┌─────────────────────────────────────────────────────┐
         │   Host 侧执行桥                                       │
         │   - zcodeTaskSessionRelay.ts (task/* session/*)      │
         │   - ZCodeTaskServiceExecutor (IZCodeTaskService)     │
         │   - zcodeTaskServiceAdapter.ts (V4 命令面执行)       │
         └─────────────────────────────────────────────────────┘
                     │
                     ▼
         ┌────────────────────────┐
         │   ZCode Agent Runtime  │  (V4 CommandInbox admission → turn 执行)
         └────────────────────────┘
```

### V4 命令面映射表

| MCP Tool                     | ZCode Tool                 | Port 方法                   | V4 命令                               | 关键字段                                                                                                       |
| ---------------------------- | -------------------------- | --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `create_session`             | `CreateSession`            | `createTask(v4Create=true)` | `createSession`                       | `workspaceId` (= `workspaceIdentity \|\| workspacePath`), `config.mode`, `config.modelSelection`, `firstInput` |
| `send_session_message`       | `SendSessionMessage`       | `sendPrompt`                | `sendText`                            | `text`, `commandId` (= `traceId`), `requestedDelivery`                                                         |
| `stop_session_generation`    | `StopSessionGeneration`    | `stopGeneration`            | `stop`                                | `expectedForegroundExecutionId`                                                                                |
| `set_session_model`          | `SetSessionModel`          | `setModel`                  | `switchModelConfig`                   | `provider`, `model`, `thought`                                                                                 |
| `compact_session`            | `CompactSession`           | `compactSession`            | `compact`                             | `{}` (空 payload)                                                                                              |
| `read_session`               | `ReadSession`              | `readSession`               | `session/readSession` (查询)          | `targetSessionId`, `messageLimit`, `afterSeq`                                                                  |
| `list_sessions`              | (新增)                     | `listSessions`              | `session/listSessions` (查询)         | `includeArchived`, `limit`                                                                                     |
| `resolve_session_permission` | `ResolveSessionPermission` | `resolvePermission`         | `permission/resolveSessionPermission` | `targetSessionId`, `permissionRequestId`, `decision`                                                           |

> **关键点**：`workspaceIdentity` 是跨 Host/远程路由的**唯一身份键**（`workspaceIdentity?.trim() \|\| workspacePath`）。V4 `createSession` 的 `workspaceId` 字段直接使用该值。Broker 的 `buildWorkspaceRequestContext` 从受信 session record 注入路由字段，**覆盖工具输入中的同名字段**。

### 模块归属

| 模块                                             | 职责                                            | 文件                                    |
| ------------------------------------------------ | ----------------------------------------------- | --------------------------------------- |
| `packages/server`                                | MCP Server 入口、传输层、工具路由               | `src/mcp/*.ts`                          |
| `apps/zcode-cli/packages/contracts`              | MCP Tool Schema（复用现有 session tool schema） | `src/tools/ai-session-orchestration.ts` |
| `apps/zcode-cli/packages/core/src/tool/handlers` | 现有 Handler 复用，零修改                       | 现有文件                                |
| `packages/services`                              | 业务服务，零感知 MCP                            | 现有文件                                |

### 依赖方向（符合 architecture-policy.yaml）

```
packages/server (mcp)
    → @zcode/contracts (tool schema)
    → @zcode/services (IZCodeTaskService, IZCodeSessionService)
    → @zcode/rpc (ChannelServer 复用)
```

**不反向依赖**：`packages/services`、`packages/shared`、`apps/zcode-cli/packages/core` 完全不依赖 `packages/server/mcp`。

---

## 工具契约

### 1. `workspace_list`

**用途**：获取用户已配置/已连接的工作区列表，供用户选择后传给 `create_session`。

**输入**：

```typescript
{
} // 无参数
```

**输出**：

```typescript
{
  workspaces: Array<{
    workspaceIdentity: string; // 唯一标识，本地 = path hash，远程 = remoteSessionId
    workspacePath: string; // 显示用路径
    label: string; // 显示用名称（basename 或用户自定义）
    kind: "local" | "remote";
    projectType: "node" | "python" | "go" | "rust" | "unknown";
    lastActiveAt: number; // 最近活跃时间戳
    activeSessionCount: number; // 该工作区当前活跃会话数
  }>;
}
```

**实现来源**：

- 本地：`IZCodeTaskService.listTasks()` 按 `workspacePath` 聚合，计算 `workspaceIdentity = hash(workspacePath)` 或配置显式 identity
- 远程：`windowRemoteConnectionRegistry.getAll()` 已连接远程工作区（含 `remoteSessionId`、`workspaceIdentity`、`workspacePath`）
- 合并去重（按 `workspaceIdentity`），按 `lastActiveAt` 降序

---

### 2. `list_sessions`

**用途**：查看某工作区下的所有会话，供用户选择继续或新建。

**输入**：

```typescript
{
  workspaceIdentity: string;   // 必填，来自 workspace_list
  workspacePath?: string;      // 可选，本地场景显示用
  includeArchived?: boolean;   // 默认 false
  limit?: number;              // 默认 50
}
```

**输出**：复用 `ZCodeSessionInfo[]`（`packages/shared/src/zcode-protocol-legacy-types.ts`）

```typescript
{
  sessions: Array<{
    sessionId: string;
    workspacePath: string;
    title: string;
    status: "idle" | "running" | "waiting" | "paused" | "completed" | "error";
    mode: string;
    updatedAt: number;
    createdAt: number;
    // ... 其他现有字段
  }>;
}
```

**实现**：直接透传 `ZCodeSessionPort.listSessions` → broker `session/listSessions` → executor `IZCodeSessionService.listSessions`。

---

### 3-9. 现有 7 个 Session Tools + `list_sessions`

**直接复用现有 Contracts**（`apps/zcode-cli/packages/contracts/src/tools/ai-session-orchestration.ts`）：

| MCP Tool Name                | ZCode Tool                 | Contract Schema                                                                |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `create_session`             | `CreateSession`            | `CreateSessionInputSchema` / `CreateSessionOutputSchema`                       |
| `send_session_message`       | `SendSessionMessage`       | `SendSessionMessageInputSchema` / `SendSessionMessageOutputSchema`             |
| `read_session`               | `ReadSession`              | `ReadSessionInputSchema` / `ReadSessionOutputSchema`                           |
| `stop_session_generation`    | `StopSessionGeneration`    | `StopSessionGenerationInputSchema` / `StopSessionGenerationOutputSchema`       |
| `set_session_model`          | `SetSessionModel`          | `SetSessionModelInputSchema` / `SetSessionModelOutputSchema`                   |
| `compact_session`            | `CompactSession`           | `CompactSessionInputSchema` / `CompactSessionOutputSchema`                     |
| `resolve_session_permission` | `ResolveSessionPermission` | `ResolveSessionPermissionInputSchema` / `ResolveSessionPermissionOutputSchema` |
| `list_sessions`              | (新增暴露)                 | `ZCodeSessionPort.listSessions` 参数/返回                                      |

**参数透传规则**：MCP `tools/call` 的 `arguments` 直接透传给对应 ZCode Tool Handler，**零转换、零默认值注入**。Handler 现有校验逻辑保持不变。

**关键字段说明**：

- `create_session.workspacePath`：本地绝对路径，**必须存在**（V4 `createSession` 的 `workspaceId` 取 `workspaceIdentity \|\| workspacePath`）
- `create_session.workspaceIdentity`：远程工作区身份（远程场景必填），本地可选
- `send_session_message.traceId`：必填，作为 V4 `sendText.commandId` 与 admission 幂等键
- `read_session.sessionId`：即 `taskId`，目标会话标识

---

## 传输层

### stdio（本地调用）

```
Claude Desktop / Cursor 配置:
{
  "mcpServers": {
    "zcode": {
      "command": "zcode-server",
      "args": ["mcp", "stdio"]
    }
  }
}
```

### HTTP+SSE（远程/网络调用）

```
启动: zcode-server mcp http --port 3031 --token $ZCODE_MCP_TOKEN

客户端连接:
GET  /mcp/sse          → 建立 SSE 连接接收通知
POST /mcp/tools/call   → 调用工具
POST /mcp/tools/list   → 列出工具
POST /mcp/initialize   → 初始化协商
```

**复用现有 HTTP 基础设施**：`packages/server/src/http.ts` 的 Hono app、鉴权中间件、WebSocket 升级机制。`/mcp` 路径前缀与现有 `/ws`、`/api/` 无冲突。

---

## 启动入口

### `packages/zcode-server-cli/src/cli.ts` 新增子命令

```bash
zcode-server mcp stdio                    # stdio 传输（默认）
zcode-server mcp http --port 3031         # HTTP+SSE 传输
zcode-server mcp http --port 3031 --token $TOKEN  # 带 token 保护
```

### 环境变量

| 变量                     | 说明                 | 默认            |
| ------------------------ | -------------------- | --------------- |
| `ZCODE_MCP_TRANSPORT`    | `stdio` \| `http`    | `stdio`         |
| `ZCODE_MCP_PORT`         | HTTP 端口            | `3031`          |
| `ZCODE_MCP_TOKEN`        | Bearer token（可选） | 无              |
| `ZCODE_SERVER_WORKSPACE` | 默认工作区路径       | `process.cwd()` |

---

## 安全模型（Phase 1 简化版）

| 层面     | 方案                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 传输加密 | stdio 进程隔离；HTTP 建议反向代理 TLS（nginx/Caddy）                                                                        |
| 认证     | 可选 `ZCODE_MCP_TOKEN`，Header `Authorization: Bearer <token>` 或 Query `?token=`                                           |
| 授权     | 工作区级隔离复用现有 `workspaceIdentity`/`remoteSessionId` 路由；会话级授权复用 `peer_session_relations` + `approvalPolicy` |
| 审计     | 现有 `permission_resolution_audit` + `peer_session_relations` 覆盖 MCP 调用链路                                             |

**不引入** OAuth、mTLS、API Key 管理、RBAC——Phase 2 单独特性。

---

## 验收场景

| 场景                   | 步骤                                                                                                                      | 预期结果                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **本地 stdio 调用**    | Claude Desktop 配置 stdio → 调用 `workspace_list` → 选工作区 → `create_session` → `send_session_message` → `read_session` | 完整会话创建/对话/读取流程跑通，V4 `createSession`/`sendText` 命令面生效 |
| **远程 HTTP+SSE 调用** | 启动 `zcode-server mcp http` → Cursor 配置 HTTP → 同流程                                                                  | 网络链路跑通，远程路由正确                                               |
| **多工作区隔离**       | 两个工作区各创建会话 → 交叉调用 `send_session_message`                                                                    | 互不干扰，`workspaceIdentity` 路由正确                                   |
| **审批委托**           | `create_session(approvalPolicy: "delegated")` → 触发审批 → `resolve_session_permission`                                   | AI 能代审批，用户 UI 同步可见                                            |
| **并发会话**           | 同一工作区并行创建 3 个 `yolo` 会话并发送消息                                                                             | 3 个会话独立推进，`read_session` 正确聚合结果                            |

---

## 实现顺序

| 步骤 | 交付                                                                  | 依赖                             |
| ---- | --------------------------------------------------------------------- | -------------------------------- |
| 1    | `packages/server/src/mcp/types.ts` — MCP 协议核心类型                 | 无                               |
| 2    | `packages/server/src/mcp/transport-stdio.ts` — stdio 传输             | 1                                |
| 3    | `packages/server/src/mcp/transport-http.ts` — HTTP+SSE 传输           | 1, `packages/server/src/http.ts` |
| 4    | `packages/server/src/mcp/tool-router.ts` — 工具名 → Handler 映射      | 1, 现有 Handler                  |
| 5    | `packages/server/src/mcp/workspace-tools.ts` — `workspace_list` 实现  | 4, `IZCodeTaskService`           |
| 6    | `packages/server/src/mcp/session-tools.ts` — 暴露 8 个 session tools  | 4, 现有 Port/Handler             |
| 7    | `packages/server/src/mcp/index.ts` — `createMcpServer(services)` 入口 | 1-6                              |
| 8    | `packages/zcode-server-cli/src/cli.ts` — `mcp` 子命令                 | 7                                |
| 9    | Contracts 导出确认（现有 schema 复用，无新增）                        | 现有                             |
| 10   | 手工验收：Claude Desktop stdio / Cursor HTTP 双链路跑通               | 1-9                              |

---

## 依赖与阻塞

- **无外部新依赖**：MCP 协议纯 JSON-RPC 2.0，用现有 `zod` 校验、`hono` HTTP、`@hono/node-ws` WebSocket
- **无 Schema 变更**：复用现有 `ai-session-orchestration.ts` 所有 tool schema
- **无服务层变更**：`IZCodeTaskService`/`IZCodeSessionService` 接口完全稳定
- **阻塞项**：无

---

## 后续扩展（不在本 PR）

| 扩展                                            | 触发条件                        |
| ----------------------------------------------- | ------------------------------- |
| MCP Resources (`zcode://session/{id}/snapshot`) | 客户端需要只读订阅/缓存会话快照 |
| MCP Notifications (`session/changed` 推送)      | 客户端需要实时唤醒而非轮询      |
| 认证体系                                        | 多用户/多租户部署需求           |
| `workspace_discover` / `workspace_ensure`       | 用户反馈「工作区发现不便」      |
| `run_task` 组合工具                             | 客户端反馈「单轮任务太繁琐」    |

---

## 文档更新清单（同 PR 必做）

- [ ] `docs/specs/features/mcp-server-support.md`（本文档）
- [ ] `packages/server/README.md` — 新增 MCP Server 使用说明
- [ ] `packages/zcode-server-cli/README.md` — 新增 `mcp` 子命令文档
- [ ] `docs/notes/implemented/mcp-server-support.md` — Agent Note（rationale、alternatives、consequences）

---

## 备注

- **不修改** `apps/zcode-cli/packages/core/src/tool/handlers/` 任何现有文件
- **不修改** `packages/services` 任何业务逻辑
- **不新增** `packages/shared` 协议类型
- 所有新代码集中在 `packages/server/src/mcp/` 与 `packages/zcode-server-cli/src/cli.ts` 的 `mcp` 子命令
- **V4 协议为准**：`create_session` 必须走 `v4Create=true` 路径；`send_session_message` 走 V4 `sendText`；`compact_session`/`set_session_model`/`stop_session_generation` 走对应 V4 命令。Legacy 协议不在 MCP 暴露范围内。
