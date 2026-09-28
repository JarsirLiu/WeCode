# AI 会话编排能力

## 目标

让 AI 能在当前会话中**创建独立会话、向会话发消息、读取进度/结果**，实现多任务并行编排与后台长任务代管。

- 会话是真正的持久化会话：用户可见、可进去打断、可接管、侧边栏列表可见
- 不是子代理：独立进程、独立 MCP、独立工具面、可跨 Host 远程
- 复用现有 `IZCodeTaskService` / `IZCodeSessionService` RPC 服务
- **核心原则**：子会话完全自主跑完（`mode: "yolo"`），不卡在审批上；当前会话通过轮询收集结果

---

## 架构现状

| 层级 | 组件 | 状态 |
|------|------|------|
| **服务端** | `IZCodeTaskService` (packages/services/src/session/zcodeTaskService.ts) | ✅ 完整实现：`createTask`、`sendPrompt`、`getTaskSnapshot`、`listTasks`、`stopGeneration`、`closeTask`、`resumeTask`、`setModel`、`setMode`、`compactSession` 等 |
| **服务端** | `IZCodeSessionService` (packages/services/src/zcode-session/zcodeSession.ts) | ✅ 完整实现：`createSession`、`readSession`、`listSessions`、`setModel`、`setThoughtLevel`、`setMode` 等 |
| **RPC 暴露** | `ServiceChannels.ZCodeTask` / `ZCodeSession` / `ZCodeAgent` | ✅ Host 已注册并通过 ChannelServer 暴露 |
| **Renderer 访问** | `RemoteServiceAccess.zcodeTaskService` / `zcodeSessionService` | ✅ `packages/client/src/remoteServiceAccess.ts` |
| **Core Runtime** | 端口注入到 `ToolExecutionContext` | ✅ 完整：`ZCodeTaskPort`/`ZCodeSessionPort` 已声明并传播到 `call-runner.ts` |
| **AI 工具** | 6 个会话编排工具 | ✅ 完整：contracts schema + handler + `includeZCodeTask` gate 已实现，contracts dist 已构建 |

---

## 设计方案

### 1. 新增 Contracts 端口（镜像服务接口，避免跨包耦合）

参考 `BotsServicePort` 模式，新建两个端口文件：

```
apps/zcode-cli/packages/contracts/src/interfaces/
├── zcode-task.port.ts      # 镜像 IZCodeTaskService 编排所需方法
└── zcode-session.port.ts   # 镜像 IZCodeSessionService 编排所需方法
```

**zcode-task.port.ts** - AI 编排核心端口：

```typescript
// 所有方法统一的尾部字段（与 BotsCommandExecutionInput 同约定）：
// - sessionId：调用方会话（工具 handler 从 ToolExecutionContext 传入），broker 用它
//   解析受信 session record。不从 broker 闭包取——ZCodeProtocolAgentServerContext
//   只有 context.sessions 索引，没有"当前会话"概念。
// - traceContext：agent 侧全链路追踪，经反向请求传播给 host。
// - signal：模型侧超时/取消。
export interface ZCodeTaskPortRequestContext {
  sessionId: string;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

export interface ZCodeTaskPort {
  createTask(params: {
    workspacePath: string;
    workspaceIdentity?: string;       // 会被受信上下文覆盖
    mode?: ZCodeTaskMode;              // 6 值：yolo|plan|edit|auto|autoEdit|build
    modelSelection?: ModelSelection;
    model?: string;
    thoughtLevel?: string;
    draftSessionId?: string;
    forkedFromTaskId?: string;
    automationId?: string;
    offPeakTaskId?: string;
    deferPersistenceUntilFirstPrompt?: boolean;
    // 无 initialPrompt：Phase 1 不支持一步到位（见 §3.1）
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiTaskCreateResult>;

  sendPrompt(params: {
    taskId: string;
    traceId: TraceId;                 // 必传
    content: string;
    queryId?: string;
    messageId?: string;
    attachments?: ZCodePromptAttachment[];
    toolDenylist?: string[];
    modelSelection?: ModelSelection;
    // 无 waitForCompletion、无 modelExecution：Phase 1 纯异步（见 §3.2.2）
  } & ZCodeTaskPortRequestContext): Promise<void>;

  getTaskSnapshot(params: {
    taskId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    messageLimit?: number;
    byteBudget?: number;
    toolLimit?: number;
    resumeModelPolicy?: "task-index" | "ui-resolved-only";
    // status 从 session projection 读（6 值），不读 persist 3 值（见 §3.2.3）
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiTaskSnapshot | null>;

  listTasks(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeTaskMeta[]>;

  stopGeneration(params: {
    taskId: string;
    runId?: TraceId;
  } & ZCodeTaskPortRequestContext): Promise<void>;

  setModel(params: {
    taskId: string;
    traceId: TraceId;
    modelSelection: ModelSelection;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeAiConfigOption[]>;

  compactSession(params: {
    taskId: string;
    inputId?: string;
    instructions?: string;
    expectedRevision?: number;
  } & ZCodeTaskPortRequestContext): Promise<ZCodeSessionCompactResult>;

  // resumeTask：port 留接口，Phase 1 不暴露工具。用户指派恢复走 UI。
  resumeTask(params: {
    taskId: string;
    workspacePath: string;
    mode?: ZCodeTaskMode;
    model?: string;
    automationId?: string;
    offPeakTaskId?: string;
    mcpServers?: ZCodeAgentMcpServer[];
  } & ZCodeTaskPortRequestContext): Promise<ZCodeTaskMeta>;
}
```

> 范围约束：只暴露 AI 编排需要的方法。任务分组、归档、置顶、Claude 导入、快照分片、trajectory、token 用量等 UI 管理操作不进 AI 工具面——UI 直接走 `IZCodeTaskService` RPC。要扩时按 spec 追加，不整面镜像服务接口。

**zcode-session.port.ts** - 补足底层会话读取能力：

```typescript
export interface ZCodeSessionPortRequestContext {
  sessionId: string;   // 调用方会话，同 ZCodeTaskPortRequestContext
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

export interface ZCodeSessionPort {
  // targetSessionId：目标会话（要读的那个）。不用 sessionId——会与
  // RequestContext.sessionId（调用方）碰撞。见 §3.1 read_session 碰撞说明。
  readSession(params: {
    targetSessionId: string;
    workspacePath: string;
    messageLimit?: number;
    afterSeq?: number;
  } & ZCodeSessionPortRequestContext): Promise<ZCodeSessionStateSnapshot>;

  listSessions(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    includeArchived?: boolean;
    limit?: number;
  } & ZCodeSessionPortRequestContext): Promise<ZCodeSessionInfo[]>;
}
```

> 注意：`createSession`、`setModel`、`setMode` 等写操作走 `ZCodeTaskPort`（含 task 索引管理），只读查询走 `ZCodeSessionPort`。`readSession` 的目标字段叫 `targetSessionId` 不叫 `sessionId`，避免与调用方 session id 碰撞（这是实现里已撞出的 bug，spec 层面修正）。

---

### 2. 协议反向请求路径（broker，非直接适配器）

#### 为什么不能用直接适配器

Agent runtime 是 host（Electron main / zcode-server）`spawn` 出的**独立子进程**，两者间只有一条 stdio NDJSON 通道（`zcodeAgentProcessManager.ts`，`stdio: ["pipe","pipe","pipe"]`）。子进程无法持有 host 进程里 `IZCodeTaskService` 实例的引用——进程边界只能传序列化 JSON。因此**不能**在 `createLocalServices` 里建 `createTask: (params) => zcodeTaskService.createTask(params)` 这种直接适配器：那个适配器跑在 host 进程里，agent 子进程够不到它。

分层约束同样指向协议路径：`packages/services` 不能 import `@zcode/contracts`（后者在 `apps/zcode-cli` 下，下层反向依赖上层）。直接适配器要同时引用 `IZCodeTaskService`（services）和 `ZCodeTaskPort`（contracts），放哪个包都违反分层。

#### 实际路径：broker 反向请求

与 `BotCommand` 完全同构（见 `docs/specs/bot-weixin-ai-commands.md`「Port 与协议边界」）。正向是 host → agent（host 驱动 agent 跑任务）；**反向**是 agent → host（agent 请求 host 执行服务）。JSON-RPC 2.0 天然支持双向。一次工具调用的数据流：

```text
agent 子进程                                   host 进程
─────────────                                 ─────────────
工具 handler 调 zcodeTaskPort.createTask
  ↓
createProtocolZCodeTaskBroker（bootstrap）
  ↓ context.requestClient("task/createTask", params, resultSchema)
  ↓ 打包 {id, method, params} 写 stdout（NDJSON 一行）
  ──────────── stdio ──────────────────────→  ZCodeProtocolClient 收 {method, id}
                                                 ↓ 触发 onRequest handler
                                                 ↓ zcodeAgentService 匹配 task/createTask
                                                 ↓ safeParse 校验 → ZCodeTaskServiceExecutor
                                                 ↓ 调 IZCodeTaskService（host 内部）
                                                 ↓ client.respond(id, result)
                                                 ←── 写 agent stdin ──────────────
  读 stdin，匹配 id，resultSchema 校验
  ↓ resolve promise
工具 handler 拿到结果
```

一次往返的序列化开销固定 4 次（agent stringify + host parse + host stringify + agent parse），是 NDJSON over stdio 的物理下限，对低频编排调用不是瓶颈。

#### 三层落位

| 层 | 文件 | 职责 |
|----|------|------|
| **Contracts（port 接口）** | `apps/zcode-cli/packages/contracts/src/interfaces/zcode-task.port.ts`、`zcode-session.port.ts` | 只做结构镜像，不 import services。`ZCodeTaskPort`/`ZCodeSessionPort` 是 agent 侧依赖的接口。 |
| **Bootstrap（broker）** | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/zcode-task-broker.ts`、`zcode-session-broker.ts` | 实现 port：每次方法调用变成一条 `task/*`/`session/*` 反向请求经 `context.requestClient` 发出。装配点：`server-operations.ts`（仿 `botsServicePort: createProtocolBotsCommandBroker(context)`）。 |
| **Services（host dispatch + executor）** | `packages/services/src/zcode-agent/zcodeAgentService.ts`（dispatch）、`zcodeTaskCommandExecutor.ts`（executor 接口）、`node.ts`（装配） | `client.onRequest` 里加 `task/*`/`session/*` 分支：safeParse 校验 → 查 `ZCodeTaskServiceExecutor` → 调 `IZCodeTaskService`/`IZCodeSessionService` → `client.respond`。executor 在 `createLocalServices` 装配，lazy 闭包读取 `services.getOptional(IZCodeTaskService)`。 |

#### 身份注入：受信上下文覆盖 agent 输入

broker 的 `withTrustedContext` 把 agent 传入的业务参数与 `buildWorkspaceRequestContext(context, {sessionId, traceContext})` 合并，**后者覆盖前者中的同名路由字段**。`buildWorkspaceRequestContext`（`browser-control-broker.ts`）从 `context.sessions.get(sessionId)` 受信 session record 读取：

- `workspaceKey = workspaceIdentity ?? workspacePath`（隔离键）
- `workspacePath`、`workspaceIdentity?`、`remoteSessionId?`
- `clientMode = record.deliveryKind ?? "desktop-continuous"`
- `sessionContext = "live"`
- 新 `requestId`（`randomUUID()`）

agent 输入里同名提供的 `workspaceIdentity`/`remoteSessionId`/`clientMode` 到不了 host service 层。`context.sessions` 是进程内 Map，按调用方 sessionId 查找，跨工作区 session 查不到，从构造上隔离。

#### Runtime 端口字段

`AgentRuntimeDeps`（`apps/zcode-cli/packages/core/src/runtime/types.ts`）和 `ToolExecutionContext`（`apps/zcode-cli/packages/core/src/tool/types.ts`）新增可选字段 `zcodeTaskPort?: ZCodeTaskPort`、`zcodeSessionPort?: ZCodeSessionPort`。broker 在 `server-operations.ts` 装配后注入；纯 CLI / 未装配时字段为 undefined，handler 检测到即返回结构化失败，不伪造成功。

**远程工作区**：链路 A 远程 Host 的 agent 子进程经同一条 stdio 通道连远端 host，远端 host 的 `zcodeAgentService` 用同一套 `onRequest` dispatch 处理 `task/*`/`session/*`。工具层零感知本地还是远程。

---

### 3. 六个新工具

位置：`apps/zcode-cli/packages/core/src/tool/handlers/`

工具名遵循仓库约定（与 `BotCommand`、`CronCreate`、`OffPeakCreate` 一致用 PascalCase）。

| 工具名 | 文件 | 对应端口 | 核心能力 |
|--------|------|---------|---------|
| `CreateSession` | `create-session.ts` | `ZCodeTaskPort.createTask` | 创建新会话，**必传 `mode`**；Phase 1 不支持 `initialPrompt` 一步到位，需 `createTask` + `sendPrompt` 两步 |
| `SendSessionMessage` | `send-session-message.ts` | `ZCodeTaskPort.sendPrompt` | 发消息，**异步**：发完即返（`void`），AI 主动 `read_session` 轮询 |
| `ReadSession` | `read-session.ts` | `ZCodeSessionPort.readSession`（优先）/ `ZCodeTaskPort.getTaskSnapshot`（回退） | 读取进度/结果 |
| `StopSessionGeneration` | `stop-session-generation.ts` | `ZCodeTaskPort.stopGeneration` | 停止当前生成，会话保留可继续 |
| `SetSessionModel` | `set-session-model.ts` | `ZCodeTaskPort.setModel` | 换模型，返回服务端 authoritative configOptions |
| `CompactSession` | `compact-session.ts` | `ZCodeTaskPort.compactSession` | 手动压缩上下文 |

**无以下工具**（刻意不提供）：
- `set_session_mode` —— 中途改模式易绕过/卡住审批，**创建时指定 `mode` 定死**
- `close_session` / `archive_session` —— 会话可见性由用户控制，AI 不偷偷归档
- `resume_session` —— AI 不管历史恢复；`ZCodeTaskPort` 留 `resumeTask` 接口但 Phase 1 不暴露工具，用户指派恢复走 UI

---

#### 3.1 工具参数与返回类型定义（Contracts 侧）

在 `apps/zcode-cli/packages/contracts/src/tools/` 新增：

**create-session.tool.ts**（contracts `src/tools/ai-session-orchestration.ts`）：

```typescript
export const CREATE_SESSION_TOOL_NAME = "CreateSession";

export const CreateSessionInputSchema = z.object({
  workspacePath: z.string().min(1),
  workspaceIdentity: z.string().optional(),   // 会被受信上下文覆盖
  // mode 6 值对齐 ZCodeTaskMode（packages/shared/src/zcode-task-types-core.ts）。
  // UI mode picker 只列 4 个（ZCODE_AGENT_MODE_OPTIONS），但类型层是 6 值。
  mode: z.enum(["yolo", "plan", "edit", "auto", "autoEdit", "build"]).optional(),
  modelSelection: ModelSelectionSchema.optional(),
  model: z.string().optional(),
  thoughtLevel: z.string().optional(),
  draftSessionId: z.string().optional(),
  forkedFromTaskId: z.string().optional(),
  automationId: z.string().optional(),
  offPeakTaskId: z.string().optional(),
  // initialPrompt：Phase 1 不支持一步到位。createTask 只建会话+task 索引，
  // 第一条消息必须由后续 SendSessionMessage 发出。原因：反向请求是请求/响应模型，
  // createTask + sendPrompt 合并成一次往返需要协议层 batch 支持，Phase 1 不引入。
}).strict();

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

// 输出 = ZCodeTaskMeta（mirror IZCodeTaskService.createTask 返回），加 initialSlashCommands?。
// 注意：taskId 即会话标识，没有单独的 sessionId 字段。
export const CreateSessionOutputSchema = zcodeTaskMetaSchema.extend({
  initialSlashCommands: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type CreateSessionOutput = z.infer<typeof CreateSessionOutputSchema>;
```

> `workspaceIdentity`/`remoteSessionId`/`clientMode` 不在工具输入里给模型——broker 的 `buildWorkspaceRequestContext` 从受信 session record 注入，覆盖任何同名输入（见 §2 身份注入）。

**send-session-message.tool.ts**：

```typescript
export const SEND_SESSION_MESSAGE_TOOL_NAME = "SendSessionMessage";

export const SendSessionMessageInputSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1),
  traceId: z.string().min(1),       // 必传，全链路追踪
  queryId: z.string().optional(),
  messageId: z.string().optional(),
  attachments: z.array(PromptAttachmentSchema).optional(),
  toolDenylist: z.array(z.string()).optional(),
  modelSelection: ModelSelectionSchema.optional(),
  // 无 waitForCompletion：Phase 1 纯异步。sendPrompt 入队后立即返回 void，
  // AI 主动 read_session 轮询。理由见 §3.2.2。
}).strict();

export type SendSessionMessageInput = z.infer<typeof SendSessionMessageInputSchema>;

// 返回 void：消息已被 host 接受入队。进度/结果走 read_session。
export const SendSessionMessageOutputSchema = z.object({}).strict();
export type SendSessionMessageOutput = z.infer<typeof SendSessionMessageOutputSchema>;
```

**read-session.tool.ts**：

```typescript
export const READ_SESSION_TOOL_NAME = "ReadSession";

export const ReadSessionInputSchema = z.object({
  // 目标会话 id（AI 从 createTask 拿到的 taskId，taskId 即会话标识）。
  // 注意命名：这里叫 sessionId（目标），但 port 的 request context 里也有
  // sessionId（调用方）。两者不同——见下方碰撞说明。
  sessionId: z.string().min(1),
  messageLimit: z.number().int().positive().optional(),
  afterSeq: z.number().int().nonnegative().optional(),   // 增量读
}).strict();

export type ReadSessionInput = z.infer<typeof ReadSessionInputSchema>;
```

**`sessionId` 碰撞说明（设计要点）**：`ZCodeSessionPortRequestContext.sessionId` 是**调用方**会话（broker 用它经 `buildWorkspaceRequestContext` 解析受信 workspace）。而 `readSession` 要读的是**目标**会话——也是 `sessionId`。两者在 intersected 类型里同名碰撞，导致 handler 传两个 `sessionId` 时后者覆盖前者（永远读调用方自己）。

**修正**：port 的 `readSession` 业务参数用 `targetSessionId`（目标），request context 的 `sessionId` 保持为调用方。broker 把 `targetSessionId` 透传为业务字段，用 `context.sessionId`（调用方）调 `buildWorkspaceRequestContext`。host executor 读 `targetSessionId`，映射到 `IZCodeSessionService.readSession({ sessionId: targetSessionId, ... })`。Phase 1 目标会话必须在调用方同一 workspace 内（`context.sessions` Map 隔离）。

```typescript
// 输出：优先走 ZCodeSessionPort.readSession（完整快照），回退 ZCodeTaskPort.getTaskSnapshot（紧凑快照|null）。
// 不用 readFullHistory 开关——两条路径由哪个端口在场决定，不由模型选。
//
// 完整快照 = ZCodeSessionStateSnapshot（packages/shared），关键字段：
//   protocol: { name: "ZCode Protocol", version: 1 }   ← 注意常量是 "ZCode Protocol" 不是 "ZCode"，version 是数字 1 不是 "1.0"
//   session:    ZCodeSessionInfo    { sessionId, workspace, mode, status, model?, ... }
//   settings:   { model, thoughtLevel, mode, permission? }
//   projection: { status(6值,见§3.2.3), turnCount, totalTokenCount, contextUsed, contextWindow, pendingPermissions[], ... }
//   runtime:    { eventSeq, stateRevision, deliveryKind?, activeTurnId?, ... }
//   messages:   ZCodeMessageWithParts[]
//   todos?, todoGroups?, slashCommands?
//
// 紧凑快照 = zcodeAiTaskSnapshotSchema（见 shared/src/zcode-protocol/ai-session-orchestration.ts）
//   { taskId, title?, status(6值), turnCount?, totalTokenCount?, recentMessages?, recentToolCalls?, lastError? } | null
export const ReadSessionOutputSchema = z.union([
  zcodeSessionStateSnapshotSchema,   // 完整快照（sessionPort 在场）
  zcodeAiTaskSnapshotSchema,          // 紧凑快照（taskPort 回退）
  z.literal(null),                    // 目标不存在
]);
export type ReadSessionOutput = z.infer<typeof ReadSessionOutputSchema>;
```

> **实现必须修的 bug**：当前 host 把 `session/readSession` dispatch 到 `taskExecutor.getTaskSnapshot`（返回紧凑快照），但 broker 用 `zcodeSessionReadSessionResultSchema`（完整快照，要求 `protocol` 字段）校验响应——紧凑快照缺 `protocol`，`.strict()` 校验会拒掉。要么 host 改 dispatch 到 `IZCodeSessionService.readSession`（完整），要么 broker 改用紧凑 schema 校验。spec 取前者（readSession 本就该走 session service）。

**stop-session-generation.tool.ts**：

```typescript
export const STOP_SESSION_GENERATION_TOOL_NAME = "StopSessionGeneration";

export const StopSessionGenerationInputSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().optional(),
}).strict();

export type StopSessionGenerationInput = z.infer<typeof StopSessionGenerationInputSchema>;

// 返回 void。stopGeneration 后会话回到 idle（不是 stopped——见 §3.2.3）。
export const StopSessionGenerationOutputSchema = z.object({}).strict();
export type StopSessionGenerationOutput = z.infer<typeof StopSessionGenerationOutputSchema>;
```

**set-session-model.tool.ts**：

```typescript
export const SET_SESSION_MODEL_TOOL_NAME = "SetSessionModel";

export const SetSessionModelInputSchema = z.object({
  taskId: z.string().min(1),
  traceId: z.string().min(1),
  modelSelection: ModelSelectionSchema,
}).strict();

export type SetSessionModelInput = z.infer<typeof SetSessionModelInputSchema>;

// 返回服务端 authoritative configOptions（ZCodeConfigOption[]），不是 {success,message}。
export const SetSessionModelOutputSchema = z.array(zcodeAiConfigOptionSchema);
export type SetSessionModelOutput = z.infer<typeof SetSessionModelOutputSchema>;
```

**compact-session.tool.ts**：

```typescript
export const COMPACT_SESSION_TOOL_NAME = "CompactSession";

export const CompactSessionInputSchema = z.object({
  taskId: z.string().min(1),
  inputId: z.string().optional(),
  instructions: z.string().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();

export type CompactSessionInput = z.infer<typeof CompactSessionInputSchema>;

// 返回 IZCodeTaskService.compactSession 的结果（ZCodeSessionCompactResult）。
export const CompactSessionOutputSchema = zcodeSessionCompactResultSchema;
export type CompactSessionOutput = z.infer<typeof CompactSessionOutputSchema>;
```

> 以上三个工具的 `workspacePath`/`workspaceIdentity`/`remoteSessionId`/`clientMode` 全部由 broker 的 `buildWorkspaceRequestContext` 从受信 session record 注入，不在工具输入里给模型。与 BotCommand 同一约定。

---

#### 3.2 消息流向与同步语义（关键）

##### 3.2.1 结果如何回到创建者会话

**不是“推送”，是“拉取”**：
- AI 创建会话获得 `taskId`
- AI 通过 `send_session_message` 发送指令
- AI 通过 `read_session` **主动轮询**进度/结果
- 事件流向：`目标会话 Agent → Event Store → getTaskSnapshot/readSession → 创建者会话 AI`

**本地/远程统一**：Host 侧 `windowRemoteConnectionRegistry` 按 `workspaceIdentity`/`remoteSessionId` 路由到对应 `ServiceCollection`，端口实现自动指向本地或远端 `IZCodeTaskService`。工具层完全无感。

##### 3.2.2 发送语义：Phase 1 纯异步

**Phase 1 不实现 `waitForCompletion`**。`SendSessionMessage` 的唯一语义：

1. `sendPrompt` 入队 → host 确认接受 → 返回 `void`
2. AI 主动调用 `read_session` 轮询进度/结果

**为什么不支持同步等待**：反向请求是请求/响应模型，`waitForCompletion: true` 要把一条 stdio 上的 pending request 挂住直到会话进入终态（可能几分钟）。期间超时、取消、断连、并发占用语义都得单独定义，且 broker 的 `resultSchema` 校验在响应到达时才跑——长挂住会占满 agent 的反向请求通道。Phase 1 不引入这个复杂度。

**轮询节奏完全由编排 AI 自主把控**：通过工具调用的时间节奏控制频率——想快查就快调用 `read_session`，想慢查就晚调用。不提供定时器、不预设间隔、不推荐数值。

**后续扩展**：若要支持同步等待，正确做法是在 broker 侧发 `sendPrompt` 后内部轮询 `getTaskSnapshot` 直到终态再 resolve（多次短请求，不挂住单条连接），而非把单条反向请求挂几分钟。这是 Phase 2+ 的事。

##### 3.2.3 会话状态：6 值来源与映射

**状态枚举**（`zcodeSessionStatusSchema`，`packages/shared/src/zcode-protocol-legacy-types.ts:75`）：

| 会话状态 | 含义 | AI 应该做什么 |
|----------|------|--------------|
| `idle` | 空闲，无活跃 turn | 已发 prompt 但还没开始？等待后重查；或会话刚创建 |
| `running` | Agent 正在执行工具/生成回复 | 继续轮询 |
| `waiting` | **等待用户输入**（权限弹窗待确认、Plan 审批） | **停止自动编排**，汇报给创建者用户 |
| `paused` | 用户手动暂停（goal/target 层面） | 停止编排，汇报 |
| `completed` | 任务正常结束 | 拿结果，继续下一步 |
| `error` | 报错/崩溃 | 汇报错误，询问是否重试 |

**没有 `stopped`**。`stopGeneration` 被调用后，会话回到 `idle`（当前 turn 被中断，会话可继续），不存在 `stopped` 这个 session 状态。AI 检测停止效果：`read_session` 看到 `idle` + 上一轮是 `running` 即知被停。

**状态来源（关键）**：AI 紧凑快照的 `status` 必须来自 **session projection**（`zcodeSessionProjectionSchema.status`，6 值），**不能**来自 task persist 层的 `zcodeTaskPersistStatusSchema`（只有 `running|completed|error` 3 值）。原因：persist 层用 `deriveZCodeTaskStatusFromSessionSnapshot`（`packages/shared/src/zcode-session-task-status.ts:57-78`）把 `waiting`/`paused` 塌缩成 `running`、`idle` 映射成 `undefined`。如果 AI 快照读 persist 的 3 值，会丢掉 `waiting`/`paused`/`idle`——而 `waiting` 正是"停止自动编排"的触发条件。

> **实现方案（已实施）**：executor 的 `getTaskSnapshot` 调用 `IZodeSessionService.readSession`（`messageLimit` 控制消息截断），从 `ZCodeSessionStateSnapshot.projection` 投影出 `ZCodeAiTaskSnapshot`。不使用 `IZodeTaskService.getTaskSnapshot`（3 值 status）。投影映射：
> - `status` ← `projection.status`（6 值）
> - `turnCount` ← `projection.turnCount`
> - `totalTokenCount` ← `projection.totalTokenCount`
> - `contextUsed` ← `projection.contextUsed`
> - `contextWindow` ← `projection.contextWindow`
> - `pendingPermissions` ← `projection.pendingPermissions`
> - `lastError` ← `projection.lastError?.message`
> - `recentMessages` ← `messages`（经 `messageLimit` 截断）
> - `taskId` ← `projection.sessionId`
> - `title` ← `session.title`
>
> 选择 `readSession` 而非 `getTaskSnapshot` + `readSession` 双服务合并：session projection 已包含 AI 紧凑快照所需的全部字段，无需额外调 task service。开销等价于一次 session 读取。

**检测建议**：AI 每次 `get_task_snapshot` 或 `read_session` 后检查 `status`。`waiting`/`paused` 时在回复中明确告知用户"会话正等待您的输入/已暂停，请在侧边栏查看并决定如何继续"。

**用户发消息接管的具体机制**：
- 用户在侧边栏点进会话 → 发消息
- 该消息通过现有 `TurnSteer` 机制作为 `guide` 或 `queue` 注入目标会话
- 目标会话状态变为 `waiting`（等待用户输入被消费）
- AI 下次 `read_session` 发现 `status === "waiting"` → 停止自动编排

---

#### 3.2.4 完全自主模式（`mode: "yolo"`）

**核心用法**：当前会话 AI 创建后台会话完全代管任务，**不卡审批、不等人**：

```typescript
// 创建自主会话（Phase 1：createTask 不带 initialPrompt，两步走）
const { taskId, traceId } = await create_session({ 
  mode: "yolo",                    // 关键：永不进入 plan 模式，永不请求审批
});

// 发第一条消息（异步，发完即返）
await send_session_message({ 
  taskId, 
  traceId, 
  content: "重构 auth 模块：拆分接口、迁移调用、删旧代码、跑测试" 
});

// 当前会话 AI 自主决定轮询节奏（无预设间隔、无定时器）
const snapshot = await read_session({ sessionId: taskId, messageLimit: 10 });
if (snapshot.projection.status === "running") {
  // 编排 AI 自己决定下一次查的时间，不由框架控制
}
```

> **轮询间隔完全由编排 AI 自主把控**。编排 AI 通过工具调用的时间节奏自然控制频率——想快查就快调用 `read_session`，想慢查就晚调用。不提供定时器、不预设选项、不推荐数值。

**`yolo` 模式保证**：
- 子会话状态不会变 `waiting`（无权限弹窗、无 Plan 审批触发它）
- 无 Plan 审批、无权限弹窗、无用户确认等待
- 子会话 AI 拥有完整工具面，自主决策、自主执行
- 当前会话 AI 只需轮询收集结果

---

#### 3.2.5 远程链路语义对进度可见性的影响

| 链路类型 | 适用场景 | 进度可见性 | `ReadSession` 行为 |
|----------|----------|------------|-------------------|
| `desktop-continuous` | Desktop 本地、SSH/WSL/Docker attached remote | **实时流式**：工具调用、token 流式回传 | `readSession`/`getTaskSnapshot` 返回最新实时状态 |
| `web-remote-replayable` | 手机 Web 远控、浏览器远程 | **快照恢复**：定期同步快照，非实时 | 返回最近同步的快照，可能有延迟 |

`clientMode` 不在工具输入里给模型——broker 从受信 session record 的 `deliveryKind` 注入（见 §2 身份注入）。Host 侧按实际链路类型返回对应数据。

---

### 4. 工具注册

在 `registerBuiltInTools`（`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`）中注册：

```typescript
// 新增开关：includeZCodeTask / includeZCodeSession
// 由 Host 根据 zcodeTaskPort / zcodeSessionPort 在场且非 subagent_child 时传 true
includeZCodeTask: Boolean(deps.zcodeTaskPort) && runtime.config.taskType !== "subagent_child",
includeZCodeSession: Boolean(deps.zcodeSessionPort) && runtime.config.taskType !== "subagent_child",

// 过滤逻辑（仿照 includeBotCommand）：
if (options.includeZCodeTask !== true && ZCODE_TASK_TOOL_NAMES.has(entry.metadata.name)) {
  continue;
}
```

**工具集名称常量**（PascalCase，与 `BotCommand`/`CronCreate`/`OffPeakCreate` 一致）：

```typescript
const ZCODE_TASK_TOOL_NAMES = new Set([
  "CreateSession",
  "SendSessionMessage",
  "ReadSession",
  "StopSessionGeneration",
  "SetSessionModel",
  "CompactSession",
]);
```

**权限模型**（与 `Agent`/`Task`/`SendMessage` 一致）：

| 工具 | 风险等级 | 审批 | 副作用范围 |
|------|----------|------|------------|
| `CreateSession` | 中 | 需审批 | 创建持久会话（用户可见可清理） |
| `SendSessionMessage` | 中 | 无 | 向会话发消息（受会话自身权限约束） |
| `ReadSession` | 低 | 无 | 读取会话快照（只读） |
| `StopSessionGeneration` | 低 | 无 | 停止当前生成 |
| `SetSessionModel` | 中 | 无 | 换模型（不影响权限） |
| `CompactSession` | 低 | 无 | 压缩上下文 |

---

## 与现有能力的关系

| 能力 | 关系 |
|------|------|
| `Agent` / `Task` (subagent) | 共存。Subagent：同进程、共享资源、临时、不可见。Session Orchestration：独立进程、隔离资源、持久化、用户可见。 |
| `SendMessage` | 共存。SendMessage：发给 subagent。SendSessionMessage：发给完整会话。 |
| `BotCommand` (微信 Bot) | 正交。Bot 是外部用户入口；Session Orchestration 是 AI 内部编排能力。两者共用同一套 broker 反向请求模式。 |
| Automation / OffPeak | 可关联：`CreateSession` 支持 `automationId`/`offPeakTaskId`，自动归入分组。 |

---

## 工具加载策略：内置工具（非 Skill、非动态子集）

**结论：注册为内置工具，受 `includeZCodeTask` 开关控制，始终出现在模型工具列表中（开关打开时）。**

与工作流 10 个工具（`includeDynamicWorkflow`）、OffPeak 2 个工具（`includeOffPeak`）、BotCommand 1 个工具（`includeBotCommand`）完全一致的机制。

---

## 验收场景

1. **并行任务编排**：用户说"帮我同时重构 auth 模块、写 user 模块测试、更新 README" → AI 创建 3 个 `mode: "yolo"` 会话、分发 Prompt、轮询 `ReadSession` 聚合结果
2. **后台长任务代管**：AI 创建 `mode: "yolo"` 会话跑"全量测试+生成报告"，`SendSessionMessage` 异步发送后主会话继续别的事，定期 `ReadSession` 查进度
3. **可介入并行任务**：AI 创建 `mode: "auto"` 会话处理"重构模块 A"，用户随时可在侧边栏打断/指正，AI 轮询发现 `waiting` 停止编排汇报用户
4. **用户指派恢复历史任务**：用户说"继续昨天的那个重构任务" → Phase 1 无 `resume_session` 工具，AI 用 `CreateSession` 新建延续上下文；`resumeTask` 留 port 接口，工具后续补
5. **远程派发（Phase 2）**：本地 AI 创建会话，`workspaceIdentity` 指向服务器，服务器 AI 拉代码、配置环境、跑 CI

---

## 实现顺序

| 步骤 | 交付 | 状态 |
|------|------|------|
| 1 | `zcode-task.port.ts` + `zcode-session.port.ts` (contracts) | ✅ |
| 2 | shared 侧 wire schema `ai-session-orchestration.ts` + broker（bootstrap） | ✅ |
| 3 | Host executor 接口 + `zcodeAgentService` dispatch 10 分支 + `createLocalServices` 装配 | ✅ |
| 4 | `ToolExecutionContext` 端口字段 + `call-runner.ts` 传播 + `server-operations.ts` broker 注入 | ✅ |
| 5 | 6 个工具 handler + contracts schema + `registerBuiltInTools` 注册开关 | ✅ |
| 6 | contracts dist 构建（`pnpm --filter @zcode/contracts run build`） | ✅ |
| 7 | E2E：AI 并行创建 3 个会话、分发任务、聚合结果 | ⏳ 待手动验证 |

---

## 依赖与阻塞

- 无外部依赖，纯内部接线
- `ZCodeTaskPort` / `ZCodeSessionPort` 与现有 `session.port.ts` 不冲突（后者是底层 event store 抽象，前者是业务编排抽象，命名空间分离）
- `packages/contracts` 导出需同步更新 `index.ts`（已加 `export * from "./tools/ai-session-orchestration.js"`）
- **Phase 1 已知限制**：`initialPrompt` 一步到位不支持（需 createTask+sendPrompt 两步）；`waitForCompletion` 同步等待不支持（纯异步+轮询）；`resume_session` 工具不暴露（port 留接口）