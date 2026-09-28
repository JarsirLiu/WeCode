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
| **Core Runtime** | 端口注入到 `ToolExecutionContext` | ❌ **缺失**：需新增 `ZCodeTaskPort`、`ZCodeSessionPort` |
| **AI 工具** | 6 个会话编排工具 | ❌ **缺失**：需新增 |

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
export interface ZCodeTaskPort {
  // 创建新会话/任务
  createTask(params: CreateTaskParams): Promise<CreateTaskResult>;
  
  // 向会话发消息（像用户一样）
  sendPrompt(params: SendPromptParams): Promise<void>;
  
  // 读取会话进度/结果
  getTaskSnapshot(params: GetTaskSnapshotParams): Promise<TaskSnapshot | null>;
  
  // 列出工作区下的会话
  listTasks(params: ListTasksParams): Promise<TaskMeta[]>;
  
  // 停止当前生成
  stopGeneration(params: StopGenerationParams): Promise<void>;
  
  // 换模型
  setModel(params: SetModelParams): Promise<void>;
  
  // 压缩上下文
  compactSession(params: CompactSessionParams): Promise<void>;
  
  // 恢复历史会话（用户指派恢复历史任务时使用）
  resumeTask(params: ResumeTaskParams): Promise<TaskMeta>;
}

// 参数类型镜像服务接口，只保留 AI 编排需要的字段
export interface CreateTaskParams {
  workspacePath: string;
  workspaceIdentity?: string;
  modelSelection?: ModelSelection;
  /** 必传/强推荐。后台自主任务用 "yolo" 避免审批；可介入任务用 "auto"。不提供中途改模式工具。 */
  mode: "yolo" | "auto" | "plan" | "build";
  initialPrompt?: string;        // 创建时直接发第一条消息（可选）
  automationId?: string;         // 关联 automation（可选）
  offPeakTaskId?: string;        // 关联 off-peak 任务（可选）
}

export interface SendPromptParams {
  taskId: string;
  content: string;
  waitForCompletion?: boolean;   // true=同步等待完成，false=发完即返（默认 false）
  traceId?: string;              // 指定 traceId（可选，不传自动生成）
  attachments?: PromptAttachment[];
  toolDenylist?: string[];       // 本轮额外隐藏的工具
  modelSelection?: ModelSelection; // 单次执行覆盖模型
  modelExecution?: ModelExecutionContext; // 执行约束
  remoteSessionId?: string;      // 远程路由
  clientMode?: ZCodeTaskClientMode;
}

export interface GetTaskSnapshotParams {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  messageLimit?: number;         // 默认 50
  byteBudget?: number;           // 默认 50000
  toolLimit?: number;            // 默认 20
  clientMode?: "desktop-continuous" | "web-remote-replayable";
}

export interface ListTasksParams {
  workspacePath: string;
  workspaceIdentity?: string;
}

export interface StopGenerationParams {
  taskId: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  runId?: string;
}

export interface SetModelParams {
  taskId: string;
  modelSelection: ModelSelection;
  workspacePath?: string;
  workspaceIdentity?: string;
}

export interface CompactSessionParams {
  taskId: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  instructions?: string;
  expectedRevision?: number;
}

export interface ResumeTaskParams {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  mode?: "yolo" | "auto" | "plan" | "build";
  modelSelection?: ModelSelection;
  automationId?: string;
  offPeakTaskId?: string;
  mcpServers?: ZCodeAgentMcpServer[];
}
```

**zcode-session.port.ts** - 补足底层会话读取能力：

```typescript
export interface ZCodeSessionPort {
  readSession(params: ReadSessionParams): Promise<SessionStateSnapshot>;
  listSessions(params: ListSessionsParams): Promise<SessionInfo[]>;
}
```

> 注意：`createSession`、`setModel`、`setMode` 等写操作走 `ZCodeTaskPort`（含 task 索引管理），只读查询走 `ZCodeSessionPort`。

---

### 2. Runtime 端口注入

在 `AgentRuntimeDeps` 和 `ToolExecutionContext` 中新增：

```typescript
// apps/zcode-cli/packages/core/src/runtime/types.ts

export interface AgentRuntimeDeps {
  // ... 现有字段
  zcodeTaskPort?: ZCodeTaskPort;      // 新增
  zcodeSessionPort?: ZCodeSessionPort; // 新增
}

export interface ToolExecutionContext {
  // ... 现有字段（已含 workspaceIdentity、remoteSessionId、clientMode）
  zcodeTaskPort?: ZCodeTaskPort;       // 新增
  zcodeSessionPort?: ZCodeSessionPort;  // 新增
}
```

**Host 侧装配**（desktop/src/host/index.ts + services/node.ts）：

```typescript
// 在 createLocalServices 返回的 ServiceCollection 中已有 zcodeTaskService / zcodeSessionService
// 创建实现 ZCodeTaskPort / ZCodeSessionPort 的适配器，注入到 runtime deps

const zcodeTaskService = services.get(IZCodeTaskService);
const zcodeSessionService = services.get(IZCodeSessionService);

const zcodeTaskPort: ZCodeTaskPort = {
  createTask: (params) => zcodeTaskService.createTask(params),
  sendPrompt: (params) => zcodeTaskService.sendPrompt(params),
  getTaskSnapshot: (params) => zcodeTaskService.getTaskSnapshot(params),
  listTasks: (params) => zcodeTaskService.listTasks(params),
  stopGeneration: (params) => zcodeTaskService.stopGeneration(params),
  setModel: (params) => zcodeTaskService.setModel(params),
  compactSession: (params) => zcodeTaskService.compactSession(params),
  resumeTask: (params) => zcodeTaskService.resumeTask(params),
};

const zcodeSessionPort: ZCodeSessionPort = {
  readSession: (params) => zcodeSessionService.readSession(params),
  listSessions: (params) => zcodeSessionService.listSessions(params),
};

// 传给 AgentRuntimeDeps
```

**远程工作区**：`windowRemoteConnectionRegistry` 已为每个 remote session 创建包含 `IZCodeTaskService`/`IZCodeSessionService` 的 `ServiceCollection`，同理生成对应 Port，**工具层零感知**。

---

### 3. 六个新工具

位置：`apps/zcode-cli/packages/core/src/tool/handlers/`

| 工具名 | 文件 | 对应端口 | 核心能力 |
|--------|------|---------|---------|
| `create_session` | `create-session.ts` | `ZCodeTaskPort.createTask` | 创建新会话，**必传 `mode`**，可选 `initialPrompt` 一步到位 |
| `send_session_message` | `send-session-message.ts` | `ZCodeTaskPort.sendPrompt` | 发消息，`waitForCompletion` 控制同步/异步 |
| `read_session` | `read-session.ts` | `ZCodeTaskPort.getTaskSnapshot` / `ZCodeSessionPort.readSession` | 读取进度/结果（轻量首屏/完整历史两种模式） |
| `stop_session_generation` | `stop-session-generation.ts` | `ZCodeTaskPort.stopGeneration` | 停止当前生成，会话保留可继续 |
| `set_session_model` | `set-session-model.ts` | `ZCodeTaskPort.setModel` | 换模型（不影响权限流程） |
| `compact_session` | `compact-session.ts` | `ZCodeTaskPort.compactSession` | 手动压缩上下文 |

**无以下工具**（刻意不提供）：
- `set_session_mode` —— 中途改模式易绕过/卡住审批，**创建时指定 `mode` 定死**
- `close_session` / `archive_session` —— 会话可见性由用户控制，AI 不偷偷归档
- `resume_session` —— AI 不管历史恢复，用户指派时再考虑

---

#### 3.1 工具参数与返回类型定义（Contracts 侧）

在 `apps/zcode-cli/packages/contracts/src/tools/` 新增：

**create-session.tool.ts**：

```typescript
export const CREATE_SESSION_TOOL_NAME = "create_session";

export const CreateSessionInputSchema = z.object({
  workspacePath: z.string().describe("Workspace path to create the session in"),
  workspaceIdentity: z.string().optional().describe("Remote workspace identity for routing"),
  modelSelection: ModelSelectionSchema.optional().describe("Override model for this session"),
  /** 必传/强推荐。"yolo"=全自动无审批(后台任务)；"auto"=关键操作问(可介入)；"plan"=强制人审计划。 */
  mode: z.enum(["yolo", "auto", "plan", "build"]).describe("Collaboration mode (required for autonomous tasks)"),
  initialPrompt: z.string().optional().describe("If provided, sends this as the first user message immediately"),
  automationId: z.string().optional().describe("Associate with an automation"),
  offPeakTaskId: z.string().optional().describe("Associate with an off-peak task"),
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

export const CreateSessionOutputSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  message: z.string(),
});

export type CreateSessionOutput = z.infer<typeof CreateSessionOutputSchema>;
```

**send-session-message.tool.ts**：

```typescript
export const SEND_SESSION_MESSAGE_TOOL_NAME = "send_session_message";

export const SendSessionMessageInputSchema = z.object({
  taskId: z.string().describe("Task ID returned from create_session"),
  content: z.string().describe("Message content to send"),
  waitForCompletion: z.boolean().default(false).describe("If true, wait synchronously until session completes/errors/stops/waiting. If false (default), return immediately and poll via read_session."),
  traceId: z.string().optional().describe("Optional trace ID for correlation"),
  attachments: z.array(PromptAttachmentSchema).optional(),
  toolDenylist: z.array(z.string()).optional().describe("Additional tools to hide for this turn"),
  modelSelection: ModelSelectionSchema.optional().describe("Override model for this execution"),
  modelExecution: ModelExecutionContextSchema.optional().describe("Execution constraints"),
});

export type SendSessionMessageInput = z.infer<typeof SendSessionMessageInputSchema>;

export const SendSessionMessageOutputSchema = z.object({
  // waitForCompletion=false 时
  accepted: z.boolean().optional(),
  message: z.string().optional(),
  // waitForCompletion=true 时
  finalSnapshot: TaskSnapshotSchema.optional(),
  finalStatus: z.enum(["completed", "error", "stopped", "waiting"]).optional(),
  error: z.string().optional(),
});

export type SendSessionMessageOutput = z.infer<typeof SendSessionMessageOutputSchema>;
```

**read-session.tool.ts**：

```typescript
export const READ_SESSION_TOOL_NAME = "read_session";

export const ReadSessionInputSchema = z.object({
  taskId: z.string().describe("Task ID to read"),
  workspacePath: z.string().optional().describe("Workspace path (required for remote routing)"),
  workspaceIdentity: z.string().optional().describe("Remote workspace identity"),
  readFullHistory: z.boolean().default(false).describe("If true, return full session snapshot via ZCodeSessionPort.readSession. If false (default), return lightweight task snapshot via ZCodeTaskPort.getTaskSnapshot."),
  messageLimit: z.number().int().positive().default(50).describe("Max messages to return (snapshot mode)"),
  byteBudget: z.number().int().positive().default(50000).describe("Max bytes for snapshot (snapshot mode)"),
  toolLimit: z.number().int().positive().default(20).describe("Max tool calls to include (snapshot mode)"),
  clientMode: z.enum(["desktop-continuous", "web-remote-replayable"]).optional().describe("Snapshot format variant"),
});

export type ReadSessionInput = z.infer<typeof ReadSessionInputSchema>;

export const ReadSessionOutputSchema = z.union([
  // snapshot mode
  z.object({
    mode: z.literal("snapshot"),
    taskId: z.string(),
    sessionId: z.string(),
    status: z.enum(["idle", "running", "waiting", "paused", "completed", "error"]),
    turnCount: z.number(),
    totalTokenCount: z.number(),
    contextUsed: z.number(),
    contextWindow: z.number(),
    recentMessages: z.array(MessageSchema),
    recentToolCalls: z.array(ToolCallSchema),
    pendingPermissions: z.array(PendingPermissionSchema),
    backgroundTasks: z.array(BackgroundTaskInfoSchema),
    lastError: ErrorInfoSchema.optional(),
  }),
  // full history mode
  z.object({
    mode: z.literal("full"),
    session: SessionStateSnapshotSchema,
  }),
]);

export type ReadSessionOutput = z.infer<typeof ReadSessionOutputSchema>;
```

**stop-session-generation.tool.ts**：

```typescript
export const STOP_SESSION_GENERATION_TOOL_NAME = "stop_session_generation";

export const StopSessionGenerationInputSchema = z.object({
  taskId: z.string(),
  workspacePath: z.string().optional(),
  workspaceIdentity: z.string().optional(),
  runId: z.string().optional(),
});

export type StopSessionGenerationInput = z.infer<typeof StopSessionGenerationInputSchema>;

export const StopSessionGenerationOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type StopSessionGenerationOutput = z.infer<typeof StopSessionGenerationOutputSchema>;
```

**set-session-model.tool.ts**：

```typescript
export const SET_SESSION_MODEL_TOOL_NAME = "set_session_model";

export const SetSessionModelInputSchema = z.object({
  taskId: z.string(),
  modelSelection: ModelSelectionSchema,
  workspacePath: z.string().optional(),
  workspaceIdentity: z.string().optional(),
});

export type SetSessionModelInput = z.infer<typeof SetSessionModelInputSchema>;

export const SetSessionModelOutputSchema = z.object({
  success: z.boolean(),
  configOptions: z.array(ConfigOptionSchema), // 返回更新后的 configOptions
});

export type SetSessionModelOutput = z.infer<typeof SetSessionModelOutputSchema>;
```

**compact-session.tool.ts**：

```typescript
export const COMPACT_SESSION_TOOL_NAME = "compact_session";

export const CompactSessionInputSchema = z.object({
  taskId: z.string(),
  workspacePath: z.string().optional(),
  workspaceIdentity: z.string().optional(),
  instructions: z.string().optional().describe("Optional compaction instructions"),
  expectedRevision: z.number().optional(),
});

export type CompactSessionInput = z.infer<typeof CompactSessionInputSchema>;

export const CompactSessionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type CompactSessionOutput = z.infer<typeof CompactSessionOutputSchema>;
```

---

#### 3.2 消息流向与同步语义（关键）

##### 3.2.1 结果如何回到创建者会话

**不是“推送”，是“拉取”**：
- AI 创建会话获得 `taskId`
- AI 通过 `send_session_message` 发送指令
- AI 通过 `read_session` **主动轮询**进度/结果
- 事件流向：`目标会话 Agent → Event Store → getTaskSnapshot/readSession → 创建者会话 AI`

**本地/远程统一**：Host 侧 `windowRemoteConnectionRegistry` 按 `workspaceIdentity`/`remoteSessionId` 路由到对应 `ServiceCollection`，端口实现自动指向本地或远端 `IZCodeTaskService`。工具层完全无感。

##### 3.2.2 `waitForCompletion` 两种模式详细语义

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `waitForCompletion: false` (默认) | 1. `sendPrompt` 入队<br>2. 即刻返回 `{ accepted: true }`<br>3. AI 后续主动调用 `read_session` 轮询 | 并行任务编排、后台长任务、AI 需要在等待期间做别的事 |
| `waitForCompletion: true` | 1. `sendPrompt` 入队<br>2. 阻塞等待直到会话进入 `completed`/`error`/`stopped`/`waiting`<br>3. 返回 `finalSnapshot` + `finalStatus` | 简单线性任务、AI 需要拿到结果才能继续下一步 |

**同步等待的超时/取消**：由调用方（模型侧）通过 `AbortSignal` 控制，底层 `sendPrompt` 透传 `signal` 参数。

##### 3.2.3 用户介入与接管（停止自动编排的触发条件）

**AI 不决定何时停止——会话状态决定**：

| 会话状态 (`SessionProjection.status`) | 含义 | AI 应该做什么 |
|--------------------------------------|------|--------------|
| `running` | Agent 正在执行工具/生成回复 | 继续轮询或等待 |
| `waiting` | **等待用户输入**（用户在侧边栏发了消息，或权限弹窗待确认，或 Plan 审批） | **停止自动编排**，汇报给创建者用户，等待用户指示 |
| `paused` | 用户手动暂停 | 停止编排，汇报 |
| `completed` | 任务正常结束 | 拿结果，继续下一步 |
| `error` | 报错/崩溃 | 汇报错误，询问是否重试 |
| `stopped` | `stopGeneration` 被调用 | 汇报已停止 |

**检测建议**：AI 每次 `read_session` 后检查 `status` 字段。如果是 `waiting`/`paused`，应在回复中明确告知用户“会话正等待您的输入/已暂停，请在侧边栏查看并决定如何继续”。

**用户发消息接管的具体机制**：
- 用户在侧边栏点进会话 → 发消息
- 该消息通过现有 `TurnSteer` 机制作为 `guide` 或 `queue` 注入目标会话
- 目标会话状态变为 `waiting`（等待用户输入被消费）
- AI 下次 `read_session` 发现 `status === "waiting"` 且有新的用户消息 → 停止自动编排

---

#### 3.2.4 完全自主模式（`mode: "yolo"`）

**核心用法**：当前会话 AI 创建后台会话完全代管任务，**不卡审批、不等人**：

```typescript
// 创建自主会话
const { taskId } = await create_session({ 
  mode: "yolo",                    // 关键：永不进入 plan 模式，永不请求审批
  initialPrompt: "重构 auth 模块：拆分接口、迁移调用、删旧代码、跑测试" 
});

// 异步发射
await send_session_message({ taskId, content: "开始", waitForCompletion: false });

// 当前会话 AI 自主决定轮询节奏（无预设间隔、无定时器）
// 根据任务类型自己把控：快任务勤查、慢任务懒查、中间干别的事
const snapshot = await read_session({ taskId, messageLimit: 10, toolLimit: 5 });
if (snapshot.status === "running") {
  // 编排 AI 自己决定下一次查的时间，不由框架控制
}
```

> **轮询间隔完全由编排 AI 自主把控**。编排 AI 通过工具调用的时间节奏自然控制频率——想快查就快调用 `read_session`，想慢查就晚调用。不提供定时器、不预设选项、不推荐数值。

**`yolo` 模式保证**：
- 子会话状态永远不会变 `waiting`（除非报错/完成/被停止）
- 无 Plan 审批、无权限弹窗、无用户确认等待
- 子会话 AI 拥有完整工具面，自主决策、自主执行
- 当前会话 AI 只需轮询收集结果

---

#### 3.2.5 远程链路语义对进度可见性的影响

| 链路类型 | 适用场景 | 进度可见性 | `ReadSession` 行为 |
|----------|----------|------------|-------------------|
| `desktop-continuous` | Desktop 本地、SSH/WSL/Docker attached remote | **实时流式**：工具调用、token 流式回传 | `getTaskSnapshot` 返回最新实时状态 |
| `web-remote-replayable` | 手机 Web 远控、浏览器远程 | **快照恢复**：定期同步快照，非实时 | `getTaskSnapshot` 返回最近同步的快照，可能有延迟 |

**工具参数 `clientMode`**：允许调用方指定期望的快照格式，Host 侧根据实际链路类型返回对应数据。

---

### 4. 工具注册

在 `registerBuiltInTools`（`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`）中注册：

```typescript
// 新增开关：includeZCodeTask
// 由 Host 根据 zcodeTaskPort 在场且非 subagent_child 时传 true
includeZCodeTask: Boolean(deps.zcodeTaskPort) && runtime.config.taskType !== "subagent_child",

// 过滤逻辑（仿照 includeDynamicWorkflow）：
if (options.includeZCodeTask === false && ZCODE_TASK_TOOL_NAMES.has(entry.metadata.name)) {
  continue;
}
```

**工具集名称常量**：

```typescript
const ZCODE_TASK_TOOL_NAMES = new Set([
  "create_session",
  "send_session_message",
  "read_session", 
  "stop_session_generation",
  "set_session_model",
  "compact_session",
]);
```

**权限模型**（与 `Agent`/`Task`/`SendMessage` 一致）：

| 工具 | 风险等级 | 审批 | 副作用范围 |
|------|----------|------|------------|
| `create_session` | 低 | 无 | 创建持久会话（用户可见可清理） |
| `send_session_message` | 低 | 无 | 向会话发消息（受会话自身权限约束） |
| `read_session` | 低 | 无 | 读取会话快照（只读） |
| `stop_session_generation` | 低 | 无 | 停止当前生成 |
| `set_session_model` | 低 | 无 | 换模型（不影响权限） |
| `compact_session` | 低 | 无 | 压缩上下文 |

---

## 与现有能力的关系

| 能力 | 关系 |
|------|------|
| `Agent` / `Task` (subagent) | 共存。Subagent：同进程、共享资源、临时、不可见。Session Orchestration：独立进程、隔离资源、持久化、用户可见。 |
| `SendMessage` | 共存。SendMessage：发给 subagent。SendSessionMessage：发给完整会话。 |
| `bot_command` (微信 Bot) | 正交。Bot 是外部用户入口；Session Orchestration 是 AI 内部编排能力。 |
| Automation / OffPeak | 可关联：`create_session` 支持 `automationId`/`offPeakTaskId`，自动归入分组。 |

---

## 工具加载策略：内置工具（非 Skill、非动态子集）

**结论：注册为内置工具，受 `includeZCodeTask` 开关控制，始终出现在模型工具列表中（开关打开时）。**

与工作流 10 个工具（`includeDynamicWorkflow`）、OffPeak 2 个工具（`includeOffPeak`）、BotCommand 1 个工具（`includeBotCommand`）完全一致的机制。

---

## 验收场景

1. **并行任务编排**：用户说"帮我同时重构 auth 模块、写 user 模块测试、更新 README" → AI 创建 3 个 `mode: "yolo"` 会话、分发 Prompt、轮询 `read_session` 聚合结果
2. **后台长任务代管**：AI 创建 `mode: "yolo"` 会话跑"全量测试+生成报告"，`waitForCompletion: false`，主会话继续别的事，定期 `read_session` 查进度
3. **可介入并行任务**：AI 创建 `mode: "auto"` 会话处理"重构模块 A"，用户随时可在侧边栏打断/指正，AI 轮询发现 `waiting` 停止编排汇报用户
4. **用户指派恢复历史任务**：用户说"继续昨天的那个重构任务"，AI 用 `resume_session`（后续补齐）或 `create_session` 新建延续上下文
5. **远程派发（Phase 2）**：本地 AI 创建会话，`workspaceIdentity` 指向服务器，服务器 AI 拉代码、配置环境、跑 CI

---

## 实现顺序

| 步骤 | 交付 | 验收 |
|------|------|------|
| 1 | `zcode-task.port.ts` + `zcode-session.port.ts` (contracts) | typecheck 通过 |
| 2 | Runtime deps + ToolExecutionContext 注入 | 现有测试通过 |
| 3 | Host 装配适配器（local + remote） | 本地/远程 createTask 可用 |
| 4 | `create_session` 工具 | AI 能创建会话，侧边栏可见 |
| 5 | `send_session_message` 工具 | AI 能发消息，`waitForCompletion` 同步/异步均可 |
| 6 | `read_session` 工具 | AI 能读进度/结果，支持首屏/完整两种模式 |
| 7 | `stop_session_generation` / `set_session_model` / `compact_session` | 控制工具可用 |
| 8 | E2E：AI 并行创建 3 个会话、分发任务、聚合结果 | 手动验证 |

---

## 依赖与阻塞

- 无外部依赖，纯内部接线
- 需确认 `ZCodeTaskPort` / `ZCodeSessionPort` 类型定义不与现有 `session.port.ts` 冲突（后者是底层 event store 抽象，前者是业务编排抽象，命名空间分离）
- `packages/contracts` 导出需同步更新 `index.ts`