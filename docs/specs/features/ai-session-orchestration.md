# AI 会话编排能力

## UI 展示规则

会话编排工具在协议层仍保留 `CreateSession`、`ReadSession`、`SendSessionMessage` 等独立 tool-call 行，便于审计、重放、失败定位和增量恢复；聊天 UI 不应把这些内部步骤显示成三张互不相关的工具卡。对同一 assistant turn 内、按 `CreateSession → ReadSession → SendSessionMessage` 顺序连续出现的会话编排行，UI 投影为一个 `SessionBot` 工作项：

- 摘要行只显示一次“会话管理”及整体状态（运行中、已完成或失败）；
- 展开后列出实际执行的步骤和最终 `ReadSession` 快照中的结果文本；
- 首行 `rowId` 是聚合项的稳定 UI identity，后续步骤更新不得重置展开状态；
- 任一步骤失败、顺序不完整、跨 assistant turn 或被其他可见工作项打断时，不聚合。未聚合的会话编排工具行使用 `session-orchestration` 专属工具卡（见下），不得落入 raw JSON 兜底卡。
- 会话编排工具（`CreateSession`、`ReadSession`、`SendSessionMessage`、`StopSessionGeneration`、`SetSessionModel`、`CompactSession`、`ResolveSessionPermission`、`WorkspaceList`、`ListSessions`）统一登记在 `packages/shared/src/tool-identity.ts` 的 `session-orchestration` family，由专属 renderer（`ToolCallBlocks/renderers/session-orchestration.tsx`）渲染：摘要行为机器人图标 + 具体工具动作（创建会话、读取会话结果等，不显示"会话管理"类目词），展开后按工具提取结构化输入与结果摘要字段；`ListSessions` 必须显示会话数量及每条会话的标题、ID 和状态，不渲染全量 JSON dump（输出无法解析为 JSON 时才回退纯文本）；该 renderer 与其他工具 renderer 完全隔离，不得复用或改动 Bash/Read/MCP 等既有渲染路径。
- `LoadToolSet` 是唯一动态工具入口，其模型描述列出可加载工具集、用途和包含的工具，并说明当当前工具面缺少能力时直接按精确 ID 加载，下一轮即可使用。历史消息中的旧 `ToolSearch`/`tool_search` 与当前 `LoadToolSet`/`load_tool_set` 都由独立 `tool-discovery` renderer 结构化呈现，不展示完整工具目录 JSON，也不落入通用 raw JSON 兜底卡。`ToolSearch` 只为历史回放保留 UI identity，不再注册到 runtime/provider schema。
- Bash、Read、MCP 等非会话工具不受影响，继续沿用各自的“开始 → 更新 → 终态结果”卡片。

这只是 transcript 的派生展示，不复制 session 状态、不改变工具事件、不改变 `ReadSession`作为权威结果来源。desktop continuous 和 web/mobile replayable 都使用相同的 row 投影规则。

## 目标

会话编排工具集通过动态工具面暴露。首轮可见的 `LoadToolSet` 描述必须包含 `session` 的用途及 `CreateSession`、`ReadSession` 等成员工具。需要会话编排而相关工具当前不可见时，模型直接调用 `LoadToolSet({ toolset_id: "session" })`；不得要求模型先调用搜索工具或依赖用户提醒。

让 AI 能在当前会话中**创建独立会话、向会话发消息、读取进度/结果**，实现多任务并行编排与后台长任务代管。

- 会话是真正的持久化会话：用户可见、可进去打断、可接管、侧边栏列表可见
- 不是子代理：独立进程、独立 MCP、独立工具面、可跨 Host 远程
- 复用现有 `IZCodeTaskService` / `IZCodeSessionService` RPC 服务
- **核心原则**：子会话完全自主跑完（`mode: "yolo"`），不卡在审批上；当前会话通过轮询收集结果

## WorkspaceList 工作区目录

`WorkspaceList` 只用于发现 Host 已知的本地与远程工作区，不能用 task/session 历史推导工作区集合。Host 设置服务持有工作区索引，来源为 `lastWorkspaceSession` 与 `recentProjects`；Host 通过 `ISettingService.listWorkspaces()` 汇总、去重并剥离远程连接敏感细节。没有 task 的工作区和远程工作区也必须可见。

AI 的读取链路独立于 task/session 命令：`WorkspaceIndexPort → workspace/list 反向协议 → Host WorkspaceIndex executor → ISettingService.listWorkspaces()`。调用方 session 仅作为 Host 反向请求的受信身份和路由上下文；它不是被列出的工作区过滤条件。协议未装配、调用方 session 无效或 Host 索引服务不可用时，工具必须返回结构化失败，不得改用 `process.cwd()`、`listTasks()`、本地缓存或 MCP HTTP endpoint。

工具仅返回索引所拥有的摘要字段：`workspaceIdentity`（本地工作区为空时使用 `workspacePath` 作为稳定身份键）、`workspacePath`、`label`、`kind`，以及可选的 `workspacePurpose` / `lastConnectionStatus`。不得推测 `projectType`、`lastActiveAt` 或 `activeSessionCount`；这些字段既不属于工作区索引，也无法由现有 authoritative source 证明。MCP 可以复用同一个 Host 设置索引服务，但 MCP ACL、外部目标 session 和 transport 适配仍由 MCP 自己负责，不反向依赖 AI 工具 handler。

`WorkspaceList` 与 `ListSessions` 同属动态 `session` toolset。`ListSessions` 查询本地 workspace 时，先按 workspace path 读取，再允许旧会话在 `workspace_id` 缺失时通过 `path`/`directory` 匹配；远程 workspace identity 包含连接边界，必须精确匹配持久化 `workspace_id`，不得回退到相同远程路径。列表查询默认排除归档会话，调用方可显式开启归档项。

```text
AI ToolEntry
  → WorkspaceIndexPort (caller session + trace + cancellation)
  → workspace/list protocol request (受信 session record)
  → Host WorkspaceIndex executor
  → ISettingService.listWorkspaces() (唯一索引事实源)
```

## 消息投递准入（Phase 1.5）

`SendSessionMessage` 的成功返回不是“请求已写入 stdio”，而是目标 Host 已将该输入交给 CLI/runtime `CommandInbox` 后的 **admission**。唯一可变的 admission/队列事实仍属于目标 session runtime；broker、主会话和 UI 都不得维护第二份已接受输入队列。

```text
AI tool → Host task service → CommandInbox admission → target turn
             │                    │
             └── admission 回执 ──┘
```

返回值为：

```ts
{
  messageId: string; // 发送方提供的重试幂等键；未提供时工具生成并回传
  turnId: string; // 当前实现等于 V4 commandId，供 ReadSession 的结果关联
  acceptedAt: number; // Host 收到 V4 ACK 的时间；不是完成时间
  deduplicated: boolean; // 同 commandId 重试命中既有 admission
}
```

- `traceId` 只用于链路观测，`queryId` 只用于上层分组；二者都不是投递幂等键。
- 无附件的发送统一经 V4 `sendText`，`messageId → commandId → turnId`。同一个 `messageId` 的网络重试由 `CommandInbox` 返回 `duplicate`，不得新开 turn。
- 当前遗留附件回退仍走 legacy `session/send`，没有 V4 command ACK，因而 AI 编排工具拒绝带附件输入；附件命令面完成前不把“可能重复投递”伪装成 admission。
- `acceptedAt` 后的运行、失败、用户介入和审批均由 `ReadSession` 的权威 projection 判断；通知未来只作唤醒，不能替代读取。
- `CommandInbox` 的既有持久回查以 commandId 为准，但尚未保存内容摘要。因此“同 messageId、不同内容”跨 runtime 重启后的冲突检测不属于本阶段；在引入持久 admission record 前，调用方必须复用 messageId 时复用原始内容。

---

## 架构现状

| 层级              | 组件                                                                         | 状态                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **服务端**        | `IZCodeTaskService` (packages/services/src/session/zcodeTaskService.ts)      | ✅ 完整实现：`createTask`、`sendPrompt`、`getTaskSnapshot`、`listTasks`、`stopGeneration`、`closeTask`、`resumeTask`、`setModel`、`setMode`、`compactSession` 等 |
| **服务端**        | `IZCodeSessionService` (packages/services/src/zcode-session/zcodeSession.ts) | ✅ 完整实现：`createSession`、`readSession`、`listSessions`、`setModel`、`setThoughtLevel`、`setMode` 等                                                         |
| **RPC 暴露**      | `ServiceChannels.ZCodeTask` / `ZCodeSession` / `ZCodeAgent`                  | ✅ Host 已注册并通过 ChannelServer 暴露                                                                                                                          |
| **Renderer 访问** | `RemoteServiceAccess.zcodeTaskService` / `zcodeSessionService`               | ✅ `packages/client/src/remoteServiceAccess.ts`                                                                                                                  |
| **Core Runtime**  | 端口注入到 `ToolExecutionContext`                                            | ✅ 完整：`ZCodeTaskPort`/`ZCodeSessionPort` 已声明并传播到 `call-runner.ts`                                                                                      |
| **AI 工具**       | 9 个会话编排工具                                                             | ✅ 完整：contracts schema + handler + `includeWeCodeTask` gate 已实现，contracts dist 已构建                                                                     |

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
  createTask(
    params: {
      workspacePath: string;
      workspaceIdentity?: string; // 会被受信上下文覆盖
      mode?: ZCodeTaskMode; // 6 值：yolo|plan|edit|auto|autoEdit|build
      modelSelection?: ModelSelection;
      model?: string;
      thoughtLevel?: string;
      draftSessionId?: string;
      forkedFromTaskId?: string;
      automationId?: string;
      offPeakTaskId?: string;
      deferPersistenceUntilFirstPrompt?: boolean;
      // 创建与首条消息必须共享 V4 生命周期；initialPrompt 由 handler 在创建成功后
      // 通过同一端口发送，不在 createTask 中引入第二条写入路径。
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeAiTaskCreateResult>;

  sendPrompt(
    params: {
      taskId: string;
      traceId: TraceId; // 必传
      content: string;
      queryId?: string;
      messageId?: string;
      attachments?: ZCodePromptAttachment[];
      toolDenylist?: string[];
      modelSelection?: ModelSelection;
      // 无 waitForCompletion、无 modelExecution：Phase 1 纯异步（见 §3.2.2）
    } & ZCodeTaskPortRequestContext,
  ): Promise<void>;

  getTaskSnapshot(
    params: {
      taskId: string;
      workspacePath: string;
      workspaceIdentity?: string;
      messageLimit?: number;
      byteBudget?: number;
      toolLimit?: number;
      resumeModelPolicy?: "task-index" | "ui-resolved-only";
      // status 从 session projection 读（6 值），不读 persist 3 值（见 §3.2.3）
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeAiTaskSnapshot | null>;

  listTasks(
    params: {
      workspacePath: string;
      workspaceIdentity?: string;
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeTaskMeta[]>;

  stopGeneration(
    params: {
      taskId: string;
      runId?: TraceId;
    } & ZCodeTaskPortRequestContext,
  ): Promise<void>;

  setModel(
    params: {
      taskId: string;
      traceId: TraceId;
      modelSelection: ModelSelection;
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeAiConfigOption[]>;

  compactSession(
    params: {
      taskId: string;
      inputId?: string;
      instructions?: string;
      expectedRevision?: number;
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeSessionCompactResult>;

  // resumeTask：port 留接口，Phase 1 不暴露工具。用户指派恢复走 UI。
  resumeTask(
    params: {
      taskId: string;
      workspacePath: string;
      mode?: ZCodeTaskMode;
      model?: string;
      automationId?: string;
      offPeakTaskId?: string;
      mcpServers?: ZCodeAgentMcpServer[];
    } & ZCodeTaskPortRequestContext,
  ): Promise<ZCodeTaskMeta>;
}
```

> 范围约束：只暴露 AI 编排需要的方法。任务分组、归档、置顶、Claude 导入、快照分片、trajectory、token 用量等 UI 管理操作不进 AI 工具面——UI 直接走 `IZCodeTaskService` RPC。要扩时按 spec 追加，不整面镜像服务接口。

**zcode-session.port.ts** - 补足底层会话读取能力：

```typescript
export interface ZCodeSessionPortRequestContext {
  sessionId: string; // 调用方会话，同 ZCodeTaskPortRequestContext
  traceContext?: TraceContext;
  signal?: AbortSignal;
}

export interface ZCodeSessionPort {
  // targetSessionId：目标会话（要读的那个）。不用 sessionId——会与
  // RequestContext.sessionId（调用方）碰撞。见 §3.1 read_session 碰撞说明。
  readSession(
    params: {
      targetSessionId: string;
      workspacePath: string;
      messageLimit?: number;
      afterSeq?: number;
    } & ZCodeSessionPortRequestContext,
  ): Promise<ZCodeSessionStateSnapshot>;

  listSessions(
    params: {
      workspacePath: string;
      workspaceIdentity?: string;
      includeArchived?: boolean;
      limit?: number;
    } & ZCodeSessionPortRequestContext,
  ): Promise<ZCodeSessionInfo[]>;
}
```

> 注意：`createSession`、`setModel`、`setMode` 等写操作走 `ZCodeTaskPort`（含 task 索引管理），只读查询走 `ZCodeSessionPort`。`readSession` 的目标字段叫 `targetSessionId` 不叫 `sessionId`，避免与调用方 session id 碰撞（这是实现里已撞出的 bug，spec 层面修正）。

---

### 2. 协议反向请求路径（broker，非直接适配器）

#### 为什么不能用直接适配器

Agent runtime 是 host（Electron main / zcode-server）`spawn` 出的**独立子进程**，两者间只有一条 stdio NDJSON 通道（`zcodeAgentProcessManager.ts`，`stdio: ["pipe","pipe","pipe"]`）。子进程无法持有 host 进程里 `IZCodeTaskService` 实例的引用——进程边界只能传序列化 JSON。因此**不能**在 `createLocalServices` 里建 `createTask: (params) => zcodeTaskService.createTask(params)` 这种直接适配器：那个适配器跑在 host 进程里，agent 子进程够不到它。

分层约束同样指向协议路径：`packages/services` 不能 import `@zcode/contracts`（后者在 `apps/zcode-cli` 下，下层反向依赖上层）。直接适配器要同时引用 `IZCodeTaskService`（services）和 `ZCodeTaskPort`（contracts），放哪个包都违反分层。

#### 实际路径：broker 反向请求

与 `BotCommand` 完全同构（见 `docs/specs/features/bot-weixin-ai-commands.md`「Port 与协议边界」）。正向是 host → agent（host 驱动 agent 跑任务）；**反向**是 agent → host（agent 请求 host 执行服务）。JSON-RPC 2.0 天然支持双向。一次工具调用的数据流：

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

| 层                                       | 文件                                                                                                                                    | 职责                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contracts（port 接口）**               | `apps/zcode-cli/packages/contracts/src/interfaces/zcode-task.port.ts`、`zcode-session.port.ts`                                          | 只做结构镜像，不 import services。`ZCodeTaskPort`/`ZCodeSessionPort` 是 agent 侧依赖的接口。                                                                                                                                                                            |
| **Bootstrap（broker）**                  | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/zcode-task-broker.ts`、`zcode-session-broker.ts`                                  | 实现 port：每次方法调用变成一条 `task/*`/`session/*` 反向请求经 `context.requestClient` 发出。装配点：`server-operations.ts`（仿 `botsServicePort: createProtocolBotsCommandBroker(context)`）。                                                                        |
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

| 工具名                  | 文件                         | 对应端口                                                                        | 核心能力                                                                                                                     |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CreateSession`         | `create-session.ts`          | `ZCodeTaskPort.createTask` + `sendPrompt`                                       | 创建新会话，固定使用 V4；可选 `initialPrompt` 在创建成功后经 V4 `sendText` 投递                                              |
| `SendSessionMessage`    | `send-session-message.ts`    | `ZCodeTaskPort.sendPrompt`                                                      | 发消息，**异步**：发完即返；目标会话 turn 终态/审批/停止经 `session/changed` 唤醒创建者（见 §5），`ReadSession` 补读权威结果 |
| `ReadSession`           | `read-session.ts`            | `ZCodeSessionPort.readSession`（优先）/ `ZCodeTaskPort.getTaskSnapshot`（回退） | 读取进度/结果                                                                                                                |
| `StopSessionGeneration` | `stop-session-generation.ts` | `ZCodeTaskPort.stopGeneration`                                                  | 停止当前生成，会话保留可继续                                                                                                 |
| `SetSessionModel`       | `set-session-model.ts`       | `ZCodeTaskPort.setModel` → V4 `switchModelConfig`                               | 换模型，返回服务端 authoritative configOptions                                                                               |
| `CompactSession`        | `compact-session.ts`         | `ZCodeTaskPort.compactSession` → V4 `compact`                                   | 手动压缩上下文                                                                                                               |

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

export const CreateSessionInputSchema = z
  .object({
    workspacePath: z.string().min(1),
    workspaceIdentity: z.string().optional(), // 会被受信上下文覆盖
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
    // initialPrompt：创建成功后由 CreateSession handler 立即调用 sendPrompt，
    // 仍保持 createTask 与 sendPrompt 的独立 admission 边界。
    initialPrompt: z.string().min(1).optional(),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

// 工具输出是 ZCodeTaskMeta 的公开子集，加 initialSlashCommands?；Host 返回的
// status/provider/lastError 等内部索引字段不得直接透传到 strict schema。
// 注意：taskId 即会话标识，没有单独的 sessionId 字段。
export const CreateSessionOutputSchema = zcodeTaskMetaSchema.extend({
  initialSlashCommands: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type CreateSessionOutput = z.infer<typeof CreateSessionOutputSchema>;
```

`CreateSession` handler 必须逐字段投影 Host 的 `ZCodeTaskCreateResult` 后再返回工具层；不能把完整 task meta 直接透传，也不能为容纳内部字段而放宽工具输出的 strict schema。创建调用必须传 `v4Create: true`。当 `initialPrompt` 存在时，handler 在创建成功后使用返回的 `taskId`/`traceId` 调用一次 `sendPrompt`；这条消息走 V4 `sendText`，并使用新的 `messageId` 作为幂等键。发送失败时创建结果不会伪装成成功，工具直接失败并保留 Host 原始错误。

创建生命周期只有一个状态所有者：目标 session runtime 的 V4 `CommandInbox`。事件顺序为 `CreateSession → V4 createSession → 可选 V4 sendText → ReadSession`。没有 `initialPrompt` 时会话可以为空，标题保持 `New session`；有首条消息时由首条输入的现有标题逻辑生成标题。自定义标题不通过 `initialPrompt` 伪造，后续由明确的 rename 能力处理。

`SetSessionModel` 和 `CompactSession` 也必须只写 V4 命令面：

- `SetSessionModel` 发送 `v4/command(switchModelConfig)`，`traceId` 作为 command id，`modelSelection.options.reasoningLevel` 映射为 `thought`；Host 通过 V4 ACK 和最新快照返回 authoritative configOptions。
- `CompactSession` 发送 `v4/command(compact)`，`inputId` 作为 command id；V4 compact 是异步 admission，不接受旧协议的 `instructions` 或 `expectedRevision` 参数，结果快照通过只读 projection 读取。
- 这两个工具不得回退到 `session/setModel`、`session/compact`。V4 ACK 为 `stale` 时按 revision 重试，其他拒绝直接把 V4 reason/message 返回工具层。

> `workspaceIdentity`/`remoteSessionId`/`clientMode` 不在工具输入里给模型——broker 的 `buildWorkspaceRequestContext` 从受信 session record 注入，覆盖任何同名输入（见 §2 身份注入）。

**send-session-message.tool.ts**：

```typescript
export const SEND_SESSION_MESSAGE_TOOL_NAME = "SendSessionMessage";

export const SendSessionMessageInputSchema = z
  .object({
    taskId: z.string().min(1),
    content: z.string().min(1),
    traceId: z.string().min(1), // 必传，全链路追踪
    queryId: z.string().optional(),
    messageId: z.string().optional(),
    attachments: z.array(PromptAttachmentSchema).optional(),
    toolDenylist: z.array(z.string()).optional(),
    modelSelection: ModelSelectionSchema.optional(),
    // 无 waitForCompletion：纯异步。sendPrompt 入队后立即返回 admission，
    // AI 主动 read_session 轮询。理由见 §3.2.2。
  })
  .strict();

export type SendSessionMessageInput = z.infer<typeof SendSessionMessageInputSchema>;

// 返回 admission：消息已被 host 接受入队。进度/结果走 read_session。
export const SendSessionMessageOutputSchema = z
  .object({
    messageId: z.string(),
    turnId: z.string(),
    acceptedAt: z.number(),
    deduplicated: z.boolean(),
  })
  .strict();
export type SendSessionMessageOutput = z.infer<typeof SendSessionMessageOutputSchema>;
```

**read-session.tool.ts**：

```typescript
export const READ_SESSION_TOOL_NAME = "ReadSession";

export const ReadSessionInputSchema = z
  .object({
    // 目标会话 id（AI 从 createTask 拿到的 taskId，taskId 即会话标识）。
    // 注意命名：这里叫 sessionId（目标），但 port 的 request context 里也有
    // sessionId（调用方）。两者不同——见下方碰撞说明。
    sessionId: z.string().min(1),
    // 默认读取最近 20 条；调用方可显式传入更小范围。
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(), // 增量读
  })
  .strict();

export type ReadSessionInput = z.infer<typeof ReadSessionInputSchema>;
```

**`sessionId` 碰撞说明（设计要点）**：`ZCodeSessionPortRequestContext.sessionId` 是**调用方**会话（broker 用它经 `buildWorkspaceRequestContext` 解析受信 workspace）。而 `readSession` 要读的是**目标**会话——也是 `sessionId`。两者在 intersected 类型里同名碰撞，导致 handler 传两个 `sessionId` 时后者覆盖前者（永远读调用方自己）。

**修正**：port 的 `readSession` 业务参数用 `targetSessionId`（目标），request context 的 `sessionId` 保持为调用方。broker 把 `targetSessionId` 透传为业务字段，用 `context.sessionId`（调用方）调 `buildWorkspaceRequestContext`。host executor 读 `targetSessionId`，映射到 `IZCodeSessionService.readSession({ sessionId: targetSessionId, ... })`。目标会话不要求正在运行：若不在 `context.sessions`，Host 必须按目标 ID 从持久化记录冷恢复后再读取；已完成、空闲和冷存储会话都可读。持久化记录不存在返回 `sessionUnavailable`/`Session not found`，恢复失败保留恢复错误，不得统一伪装为 `Session is not active`。

```typescript
// 输出：优先走 ZCodeSessionPort.readSession（Host 内部完整快照），回退 ZCodeTaskPort.getTaskSnapshot；
// 工具边界统一投影为摘要，不向模型返回完整工具输入或结果。
// 不用 readFullHistory 开关——两条路径由哪个端口在场决定，不由模型选。
//
// 完整快照 = ZCodeSessionStateSnapshot（packages/shared），关键字段：
//   protocol: { name: "ZCode Protocol", version: 1 }   ← 注意常量是 "ZCode Protocol" 不是 "ZCode"，version 是数字 1 不是 "1.0"
//   session:    ZCodeSessionInfo    { sessionId, workspace, mode, status, model?, ... }
// ListSessions 在工具边界投影为扁平稳定摘要，不直接透传该协议对象。
//   settings:   { model, thoughtLevel, mode, permission? }
//   projection: { status(6值,见§3.2.3), turnCount, totalTokenCount, contextUsed, contextWindow, pendingPermissions[], ... }
//   runtime:    { eventSeq, stateRevision, deliveryKind?, activeTurnId?, ... }
//   messages/toolCalls: 工具边界只返回文本预览和工具名、callId、状态、时间；不返回完整 input/output。
//   todos?, todoGroups?, slashCommands?
//
// 紧凑快照 = zcodeAiTaskSnapshotSchema（见 shared/src/zcode-protocol/ai-session-orchestration.ts）
//   { taskId, title?, status(6值), turnCount?, totalTokenCount?, recentMessages?, recentToolCalls?, lastError? } | null
export const ReadSessionOutputSchema = z.object({
  sessionId: z.string(),
  status: z.enum(["idle", "running", "waiting", "paused", "completed", "error"]),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
  toolCalls: z
    .array(z.object({ toolCallId: z.string(), toolName: z.string(), status: z.string() }))
    .optional(),
});
export type ReadSessionOutput = z.infer<typeof ReadSessionOutputSchema>;
```

> **实现必须修的 bug**：当前 host 把 `session/readSession` dispatch 到 `taskExecutor.getTaskSnapshot`（返回紧凑快照），但 broker 用 `zcodeSessionReadSessionResultSchema`（完整快照，要求 `protocol` 字段）校验响应——紧凑快照缺 `protocol`，`.strict()` 校验会拒掉。要么 host 改 dispatch 到 `IZCodeSessionService.readSession`（完整），要么 broker 改用紧凑 schema 校验。spec 取前者（readSession 本就该走 session service）。

**stop-session-generation.tool.ts**：

```typescript
export const STOP_SESSION_GENERATION_TOOL_NAME = "StopSessionGeneration";

export const StopSessionGenerationInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().optional(),
  })
  .strict();

export type StopSessionGenerationInput = z.infer<typeof StopSessionGenerationInputSchema>;

// 返回 void。stopGeneration 后会话回到 idle（不是 stopped——见 §3.2.3）。
export const StopSessionGenerationOutputSchema = z.object({}).strict();
export type StopSessionGenerationOutput = z.infer<typeof StopSessionGenerationOutputSchema>;
```

**set-session-model.tool.ts**：

```typescript
export const SET_SESSION_MODEL_TOOL_NAME = "SetSessionModel";

export const SetSessionModelInputSchema = z
  .object({
    taskId: z.string().min(1),
    traceId: z.string().min(1),
    modelSelection: ModelSelectionSchema,
  })
  .strict();

export type SetSessionModelInput = z.infer<typeof SetSessionModelInputSchema>;

// 返回服务端 authoritative configOptions（ZCodeConfigOption[]），不是 {success,message}。
export const SetSessionModelOutputSchema = z.array(zcodeAiConfigOptionSchema);
export type SetSessionModelOutput = z.infer<typeof SetSessionModelOutputSchema>;
```

**compact-session.tool.ts**：

```typescript
export const COMPACT_SESSION_TOOL_NAME = "CompactSession";

export const CompactSessionInputSchema = z
  .object({
    taskId: z.string().min(1),
    inputId: z.string().optional(),
  })
  .strict();

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

##### 3.2.2 发送语义：纯异步 admission

**Phase 1 不实现 `waitForCompletion`**。`SendSessionMessage` 的唯一语义：

1. `sendPrompt` 入队 → host 确认接受 → 返回 admission（`messageId`、`turnId`、`acceptedAt`、`deduplicated`）
2. 编排 AI **结束当前回合**，等待 §5 的 `session/changed` 通知唤醒（目标会话 turn 完成/失败、权限请求、停止生成四类事件）
3. 收到唤醒后调用 `ReadSession`（可带 `afterSeq` 增量）获取权威结果；通知是 best-effort 且本阶段仅本地 workspace，可能丢失或重复——长时间未收到时以低频 `read_session` 轮询兜底，禁止在同一回合内用 sleep 循环忙等

**为什么不支持同步等待**：反向请求是请求/响应模型，`waitForCompletion: true` 要把一条 stdio 上的 pending request 挂住直到会话进入终态（可能几分钟）。期间超时、取消、断连、并发占用语义都得单独定义，且 broker 的 `resultSchema` 校验在响应到达时才跑——长挂住会占满 agent 的反向请求通道。Phase 1 不引入这个复杂度。

**等待语义必须写进工具描述**：模型只看得到工具描述，通知机制的醒来路径对模型不可见。`SendSessionMessage`、`CreateSession`（`initialPrompt` 触发同样 turn 生命周期）和 `StopSessionGeneration` 的描述必须如实告知：turn 结束（完成/失败/权限请求/停止）会收到 `session/changed` 通知，权威状态用 `ReadSession` 读取；模型也可以稍等后主动 `read_session` 获取回复。`ReadSession` 描述把唤醒后补读列为主用法，不再把轮询列为主用法。

**后续扩展**：若要支持同步等待，正确做法是在 broker 侧发 `sendPrompt` 后内部轮询 `getTaskSnapshot` 直到终态再 resolve（多次短请求，不挂住单条连接），而非把单条反向请求挂几分钟。这是 Phase 2+ 的事。

##### 3.2.3 会话状态：6 值来源与映射

**状态枚举**（`zcodeSessionStatusSchema`，`packages/shared/src/zcode-protocol-legacy-types.ts:75`）：

| 会话状态    | 含义                                          | AI 应该做什么                                    |
| ----------- | --------------------------------------------- | ------------------------------------------------ |
| `idle`      | 空闲，无活跃 turn                             | 已发 prompt 但还没开始？等待后重查；或会话刚创建 |
| `running`   | Agent 正在执行工具/生成回复                   | 继续轮询                                         |
| `waiting`   | **等待用户输入**（权限弹窗待确认、Plan 审批） | **停止自动编排**，汇报给创建者用户               |
| `paused`    | 用户手动暂停（goal/target 层面）              | 停止编排，汇报                                   |
| `completed` | 任务正常结束                                  | 拿结果，继续下一步                               |
| `error`     | 报错/崩溃                                     | 汇报错误，询问是否重试                           |

**没有 `stopped`**。`stopGeneration` 被调用后，会话回到 `idle`（当前 turn 被中断，会话可继续），不存在 `stopped` 这个 session 状态。AI 检测停止效果：`read_session` 看到 `idle` + 上一轮是 `running` 即知被停。

**状态来源（关键）**：AI 紧凑快照的 `status` 必须来自 **session projection**（`zcodeSessionProjectionSchema.status`，6 值），**不能**来自 task persist 层的 `zcodeTaskPersistStatusSchema`（只有 `running|completed|error` 3 值）。原因：persist 层用 `deriveZCodeTaskStatusFromSessionSnapshot`（`packages/shared/src/zcode-session-task-status.ts:57-78`）把 `waiting`/`paused` 塌缩成 `running`、`idle` 映射成 `undefined`。如果 AI 快照读 persist 的 3 值，会丢掉 `waiting`/`paused`/`idle`——而 `waiting` 正是"停止自动编排"的触发条件。

> **实现方案（已实施）**：executor 的 `getTaskSnapshot` 调用 `IZodeSessionService.readSession`（`messageLimit` 控制消息截断），从 `ZCodeSessionStateSnapshot.projection` 投影出 `ZCodeAiTaskSnapshot`。不使用 `IZodeTaskService.getTaskSnapshot`（3 值 status）。投影映射：
>
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

未提供 `messageLimit` 时，`ReadSession` 和 Host 的紧凑快照回退路径统一只读取最近 20 条消息；显式传入正整数时按调用方值读取。

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
// 创建自主会话；initialPrompt 存在时 handler 会在创建成功后立即发送首条消息
const { taskId, traceId } = await create_session({
  mode: "yolo", // 关键：永不进入 plan 模式，永不请求审批
});

// 发第一条消息（异步，发完即返；然后结束回合等 session/changed 唤醒）
await send_session_message({
  taskId,
  traceId,
  content: "重构 auth 模块：拆分接口、迁移调用、删旧代码、跑测试",
});

// 收到唤醒通知后读取权威结果（afterSeq 增量读）；通知丢失时低频轮询兜底
const snapshot = await read_session({ sessionId: taskId, messageLimit: 10 });
```

> **轮询间隔完全由编排 AI 自主把控**。编排 AI 通过工具调用的时间节奏自然控制频率——想快查就快调用 `read_session`，想慢查就晚调用。不提供定时器、不预设选项、不推荐数值。

**`yolo` 模式保证**：

- 子会话状态不会变 `waiting`（无权限弹窗、无 Plan 审批触发它）
- 无 Plan 审批、无权限弹窗、无用户确认等待
- 子会话 AI 拥有完整工具面，自主决策、自主执行
- 当前会话 AI 只需轮询收集结果

---

#### 3.2.5 远程链路语义对进度可见性的影响

| 链路类型                | 适用场景                                     | 进度可见性                             | `ReadSession` 行为                               |
| ----------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `desktop-continuous`    | Desktop 本地、SSH/WSL/Docker attached remote | **实时流式**：工具调用、token 流式回传 | `readSession`/`getTaskSnapshot` 返回最新实时状态 |
| `web-remote-replayable` | 手机 Web 远控、浏览器远程                    | **快照恢复**：定期同步快照，非实时     | 返回最近同步的快照，可能有延迟                   |

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

| 工具                    | 风险等级 | 审批   | 副作用范围                         |
| ----------------------- | -------- | ------ | ---------------------------------- |
| `CreateSession`         | 中       | 需审批 | 创建持久会话（用户可见可清理）     |
| `SendSessionMessage`    | 中       | 无     | 向会话发消息（受会话自身权限约束） |
| `ReadSession`           | 低       | 无     | 读取会话快照（只读）               |
| `StopSessionGeneration` | 低       | 无     | 停止当前生成                       |
| `SetSessionModel`       | 中       | 无     | 换模型（不影响权限）               |
| `CompactSession`        | 低       | 无     | 压缩上下文                         |

---

## 与现有能力的关系

| 能力                        | 关系                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Agent` / `Task` (subagent) | 共存。Subagent：同进程、共享资源、临时、不可见。Session Orchestration：独立进程、隔离资源、持久化、用户可见。 |
| `SendMessage`               | 共存。SendMessage：发给 subagent。SendSessionMessage：发给完整会话。                                          |
| `BotCommand` (微信 Bot)     | 正交。Bot 是外部用户入口；Session Orchestration 是 AI 内部编排能力。两者共用同一套 broker 反向请求模式。      |
| Automation / OffPeak        | 可关联：`CreateSession` 支持 `automationId`/`offPeakTaskId`，自动归入分组。                                   |

---

## 跨会话通信提案（Phase 1 完善版）

### 0. 工具能力装配约束（Phase 1.5）

内置工具使用统一的 `ToolEntry` / `ToolRegistry`，但工具清单、能力门控和 runtime 刷新不能各自维护一套判断。所有内置工具注册必须经过同一份 registration plan：

```text
runtime deps/config -> registration context -> registration plan -> ToolRegistry
                                      └──同一计划也用于 shell/分支刷新
```

计划只描述“工具是否对模型可见”和“注册时需要的声明变体”；执行端口仍由 `ToolExecutionContext` 持有，不能把端口或接受队列复制到 registry。能力门控的唯一事实来自受信 Host 注入的 port、runtime 类型和 allowlist/denylist。

本阶段不引入第二套动态插件系统，也不把 MCP、插件工具和内置工具强行合并；先保证初次装配与分支刷新调用同一计划生成器。新增会话工具只需提供 `ToolEntry` 并声明所需能力门，避免再修改多个注册入口。

### 1. 先区分控制面与消息面

本能力包含两种不同语义，不应继续全部压在 `sendPrompt/getSnapshot` 上：

| 平面         | 目标                                                 | ZCode Phase 1                            | 后续扩展              |
| ------------ | ---------------------------------------------------- | ---------------------------------------- | --------------------- |
| 会话控制面   | 创建、发起 turn、停止、换模型、压缩、读取 projection | `ZCodeTaskPort` + `ZCodeSessionPort`     | 保持稳定              |
| 跨会话消息面 | 向已存在会话投递可追踪消息、通知变化、增量读取       | `SendSessionMessage` 复用 task admission | `SessionMessageBoard` |

控制面负责事实和生命周期；消息面负责投递与唤醒。通知不能替代 `ReadSession`，后者仍是状态真相。

### 2. 请求方向与进程边界

ZCode 的工具调用路径是反向请求：

```text
Agent 进程（AI runtime）                         Host 进程
┌──────────────────────────────┐  requestClient  ┌──────────────────────────────┐
│ CreateSession handler         │ ───────────────> │ zcodeAgentService dispatch   │
│ 只依赖 ZCodeTaskPort          │   stdio/NDJSON   │ safeParse + executor         │
│ send_session_message/read...  │ <─────────────── │ IZCodeTask/SessionService    │
└──────────────────────────────┘    response      └──────────────────────────────┘
```

反向请求只解决“Agent 需要 Host 服务”；它不等于跨会话消息系统。Host 必须从受信 session record 注入 `workspaceIdentity`、`remoteSessionId`、`clientMode` 和请求上下文，不能信任 Agent 工具输入中的路由字段。

### 3. 发送结果、幂等与执行关联

`SendSessionMessage` 不应长期返回空对象。目标协议应至少返回：

```ts
{
  messageId: string; // durable admission/idempotency key
  turnId: string; // 本次执行实例
  acceptedAt: number;
  deduplicated: boolean;
}
```

字段职责固定为：

- `messageId`：持久投递和重试幂等键；同 key 同内容重复提交返回原 admission，同 key 不同内容返回 conflict。
- `turnId`：一次 Agent 执行实例；读取进度、终态和错误时用于精确关联。
- `traceId`：链路观测 ID，不承担业务幂等。
- `queryId`：可选的上层逻辑请求分组，不承担投递唯一性。

Host 接受消息后才返回 `accepted`。如果响应丢失，调用方可以用同一 `messageId` 重试，不得因为重试而产生第二个 turn。

### 4. 轮询、通知与读取语义

Phase 1 的默认路径是通知唤醒（§5）：

```text
send -> accepted(turnId) -> 结束回合 -> session/changed 唤醒 -> read_session(afterSeq/turnId)
```

`afterSeq`/`turnId` 和字节预算支持增量读取，避免每次返回完整历史。轮询只作兜底：通知丢失或重复不改变目标会话事实，低频 `read_session` 补读即可；不提供框架定时器，也不把一次长时间等待挂在单个反向请求上。

后续 Phase 2 可增加通知流：目标会话状态或消息发生变化时发送轻量 notification；编排 AI 收到通知后再调用 `ReadSession` 获取权威快照。通知只负责唤醒，不负责承载完整状态，也不应自动启动一个空闲目标会话。

#### 用户可见语义

AI 对正常会话的操作必须复用用户操作的同一条业务路径：消息进入同一个 `CommandInbox`，模型/压缩调用同一组 session command，审批回执复用现有 `respondPermission → resolveInteraction`。因此目标会话的历史、状态和 UI 不增加“AI 消息”“AI 审批”或第二套会话类型标记；用户可以像处理自己发起的会话一样继续介入。

Host 仍可在关系账本和审批审计中记录 `createdBy: ai`、`resolverKind: ai`，但这些字段只用于授权、并发 claim、审计和故障诊断，不得投影到普通会话消息或用户可见的审批文案中。

主动通知的事件顺序固定为：

```text
目标 runtime 状态变化
  → Host 依据 peer relation 找 creator session
  → 向 creator Agent 发送 session/changed
  → Agent 调用 ReadSession(afterSeq) 获取权威事实
  → 如有 pendingPermissions，再调用 ResolveSessionPermission
```

通知统一使用 `session/changed`，载荷为 `{ targetSessionId, sequence, kind, turnId?, requestId?, summary?, error? }`。`kind` 仅区分 `permission_requested`、`turn_completed`、`turn_failed`、`generation_stopped` 四类唤醒原因；它不是第二套状态机，而是目标 runtime 权威 `session/event` 的有界投影。通知不携带完整消息、审批输入或决议结果。Host 必须允许通知重复、丢失和乱序；`sequence` 只用于唤醒后的增量读取，不能替代 `ReadSession`。通知失败不得改变目标会话的运行结果，也不得在 Host 维护第二份事件队列。

### 5. 本地事件通知闭环（已实现）

本阶段把上面的通知边界落到本地 Host/Agent 链路，远程 workspace 路由仍不在范围内：

```text
target runtime session/event
  → services 只映射显式权威事件
  → peer relation 返回 creatorSessionId
  → 同一 Host 的 Agent Server 按 creatorSessionId 找 resident runtime
  → 现有 background notification 入口唤醒 creator Agent
  → Agent 根据 JSON 中的 kind/sequence 决定是否 ReadSession 或 ResolveSessionPermission
```

实现约束：

- 只接受 `permission.requested`、`turn.completed`、`turn.failed` 三类 runtime 事件；`resultType: "cancelled"` 显式映射为 `generation_stopped`。
- `permission.requested` 缺少权威 `requestId` 时不发送通知；错误和摘要只透传事件已有字段并截断长度，不生成默认内容。
- `creatorSessionId` 是通知路由的显式字段；找不到 creator session 或其 runtime 已回收时直接丢弃，不启动进程、不建立 Host 通知队列。
- 通知以 model-only background input 进入 creator runtime，不写入目标会话历史，也不添加“AI 消息”标记。编排器收到后只根据显式 `kind` 行动，完整事实仍通过 `ReadSession(afterSeq)` 获取。
- `sequence` 属于目标 session 的事件顺序域。重复、乱序和丢失不改变目标会话事实；恢复后的 Agent 必须以 `ReadSession(afterSeq)` 补读，不能根据通知内容猜测缺失状态。

本阶段验收包括四类事件映射、缺少 requestId 的拒绝、显式 creator 路由、resident runtime 投递和 runtime 不存在时不启动/不排队。远程 Host 路由、主动 UI 和新的通知存储队列不属于本阶段。

### 6. 与 Codex 的准确对照

Codex 的 app-server 同样支持双向 JSON-RPC，因此某些“Agent 向宿主请求能力”的路径可以称为反向请求；但本地多 Agent 控制通常在同一进程内通过 `ThreadManager/AgentControl` 直接操作，并不是每次 `send_input` 都跨 stdio。

Codex 的 message board 是另一条数据面：消息带 `message_id`、作者、目标 AgentPath、channel 和时间戳，可使用内存或 SQLite；通知只投递给活跃 turn，空闲 Agent 不会因一条消息被隐式启动。远程 board 使用 HTTP 调用和 SSE 通知，`wait_agent` 等待 mailbox 更新，而不是固定间隔轮询快照。

ZCode 应借鉴这些边界：

1. 保留当前 broker 作为控制面的反向请求路径。
2. 将 `messageId/turnId` 和 admission 结果纳入发送协议。
3. 后续增加独立的 SessionMessageBoard/notification 面，保持“通知唤醒、ReadSession 定真”。
4. 如果未来支持父子 Agent 协作，再引入类似 `AgentPath` 的树内寻址；不要把持久用户会话和临时 subagent 合并成一个生命周期模型。

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

## Phase 2 依赖：远程自动重连（决策）

远程派发的前置条件是**自动重连**：AI 编排不能要求用户先手动点击"连接远程服务器"。重启后连接不存在、任务中途网络断开、无人值守自动化等场景，都必须由 Host 程序化恢复连接，否则编排语义不成立。

当前现状（Phase 1 不变）：

- 启动只恢复"断开态远程 tab"，不做自动重连；重连是用户侧一键 UI（读取 `credentialService` 加密凭据）。
- Bot 路径已有程序化重连（`reconnectBotRemoteWorkspaceSession`），证明机制成立，只是未泛化。

Phase 2 依赖拆解：

1. **Host 侧 `ensureConnected(workspaceIdentity)`**：从 Bot 重连泛化出的程序化重连原语——加载已存加密凭据 → 建立连接 → 复用现有 connection registry 缓存；编排 admission 发现目标 workspace 连接不存在或断开时调用它，而不是直接报错。
2. **连接状态进入路由判定**：session record / workspace 路由上下文携带连接可达性，broker 在 admission 前能区分"不可达（可尝试重连）"与"凭据缺失/失效（只能失败）"；不可达且重连失败时返回明确错误，禁止静默回退本地服务。
3. **启动自动重连作为产品策略**：对用户已明确接管过的远程 workspace 默认开启，凭据缺失或失效时保持断开态并提示，不弹窗阻塞启动。它是独立决策——即使关闭，`ensureConnected` 仍保证编排期间的按需重连。

边界：自动重连只消费已存储的加密凭据，不新增凭据采集路径；重连是控制面动作，不改变目标会话的事件事实，编排层仍以 `ReadSession(afterSeq)` 补真。

---

## 实现顺序

| 步骤 | 交付                                                                                         | 状态 |
| ---- | -------------------------------------------------------------------------------------------- | ---- |
| 1    | `zcode-task.port.ts` + `zcode-session.port.ts` (contracts)                                   | ✅   |
| 2    | shared 侧 wire schema `ai-session-orchestration.ts` + broker（bootstrap）                    | ✅   |
| 3    | Host executor 接口 + `zcodeAgentService` dispatch 10 分支 + `createLocalServices` 装配       | ✅   |
| 4    | `ToolExecutionContext` 端口字段 + `call-runner.ts` 传播 + `server-operations.ts` broker 注入 | ✅   |
| 5    | 6 个工具 handler + contracts schema + `registerBuiltInTools` 注册开关                        | ✅   |
| 6    | contracts dist 构建（`pnpm --filter @zcode/contracts run build`）                            | ✅   |

> E2E 编排场景（并行创建/分发/聚合）暂缓，后续按实际使用反馈再细调，不作为本特性的验收门槛。

---

## 依赖与阻塞

- 无外部依赖，纯内部接线
- `ZCodeTaskPort` / `ZCodeSessionPort` 与现有 `session.port.ts` 不冲突（后者是底层 event store 抽象，前者是业务编排抽象，命名空间分离）
- `packages/contracts` 导出需同步更新 `index.ts`（已加 `export * from "./tools/ai-session-orchestration.js"`）
- **当前边界**：创建和首条消息是两个明确的协议 admission（handler 内按顺序执行 create+send）；`waitForCompletion` 同步等待不支持（纯异步+轮询）；通知流和 `SessionMessageBoard` 尚未实现；`resume_session` 工具不暴露（port 留接口）；`compact_session` 不支持附带压缩指令（V4 compact payload 为空对象，明确决策按不支持收口，不做 runtime/legacy 指令链补齐）；断连后的远程重连在 Phase 1 是用户侧 UI 能力，AI 不感知也不触发；Phase 2 引入 `ensureConnected` + 启动自动重连作为远程派发前置，见"Phase 2 依赖"一节。

### 失败语义

反向 relay 的成功响应必须符合对应 result schema。Host executor 或服务层抛出的异常必须通过 JSON-RPC error 响应（默认代码 `-32603`，保留错误消息；已有数值错误码则透传），不能发送 `{ success: false, error }` 作为成功 result。这样 agent 侧 `requestClient` 会直接抛出原始错误，工具层不会再把失败对象按成功 admission schema 校验而产生误导性的 Zod 字段缺失错误。
