# 内置工具动态加载机制

## 目标

解决现状：48 个内置工具全量注册，首轮上下文占用 20k+ token。引入 **ToolSearch + LoadToolSet** 双工具协作，实现：

- **首轮仅暴露 LoadToolSet + core/task-control 工具**（目标约 5k token）
- **模型按需加载工具集**，加载后永久驻留当前会话 ToolRegistry
- **未加载的工具集，模型完全不可见、不可调用**

---

## 核心原则

| 原则 | 说明 |
|------|------|
| **内置工具分组** | 现有 48 个工具按领域分为 8 个工具集，每集 1-10 个工具 |
| **静态目录、动态注册** | 工具集元数据（名字、描述、关键词、包含工具）编译期固化；运行时按需批量注册 |
| **会话级持久** | 一次 `LoadToolSet` 后，该工具集的工具永久留在当前 `AgentRuntime` 的 `ToolRegistry`，后续轮次直接可用 |
| **无加载 = 不可见** | 未加载的工具集：**不在 `registry.list()`、不在 `registry.toContracts()`、模型 schema 里没有、ToolSearch 也只返回元数据不返回可调用 schema** |
| **复用现有架构** | 复用 `ToolRegistry.register/unregister`、`registerBuiltInTools` 门控机制、端口注入、`needsApproval` 权限流 |
| **Glob/Grep 保留核心** | 结构化搜索、权限集成、token 预算控制是 Bash `find()`/`grep()` 无法替代的；embedded search 是补充能力（快速纯文本搜索）|
| **Embedded Search** | 当 `embeddedSearchEnabled: true` 时，Bash 注入 `find()`/`grep()` shell function 加速纯文本搜索（与 Glob/Grep 工具并存） |

---

## 架构现状

| 层级 | 组件 | 状态 |
|------|------|------|
| **Registry** | `ToolRegistryImpl` (`apps/zcode-cli/packages/core/src/tool/registry.ts`) | ✅ 单例，随 `AgentRuntime` 生命周期 |
| **注册入口** | `registerBuiltInTools` (`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`) | ✅ 启动时一次性注册所有内置工具 |
| **工具定义** | 48 个 `ToolEntry` 分散在 `handlers/*.ts` | ✅ 已有 |
| **端口注入** | `ToolExecutionContext` 的 50+ 端口字段 | ✅ handler 通过端口访问运行时能力 |
| **权限流** | `needsApproval` + `PermissionBroker` | ✅ 完整 |
| **Embedded Search** | Bash 注入 `find()`/`grep()` shell function，加速纯文本搜索，与 Glob/Grep 工具并存 | ✅ 已实现 |
| **缓存失效** | `runtime.invalidateToolCache()` | ✅ MCP 注册后调用的先例（`runtime/methods/mcp.ts:147`） |
| **Child 防护** | `WORKFLOW_CHILD_DISALLOWED_TOOLS` | ✅ 已有先例（`runtime/helpers/tool-allowlist.ts:26`） |

---

## 最终分组方案（8 组，48 个工具）

| 组名 | 工具列表 | 默认 | 门控开关 |
|------|---------|------|---------|
| **core** (10) | `Read`, `Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite`, `Glob`, `Grep` | ✅ | 无 |
| **plan** (3) | `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion` | ❌ | 无 |
| **automation** (6) | `CronCreate`, `CronList`, `CronUpdate`, `CronDelete`, `OffPeakCreate`, `OffPeakList` | ❌ | `includeAutomation` / `includeOffPeak` |
| **session** (7) | `CreateSession`, `SendSessionMessage`, `ReadSession`, `StopSessionGeneration`, `SetSessionModel`, `CompactSession`, `ResolveSessionPermission` | ❌ | `includeZCodeTask` |
| **subagent** (8) | `Agent`, `Task`, `Skill`, `SendMessage`, `RespondToCoordinator`, `submit_result`, `escalate`, `ReadSessionContext` | ❌ | `includeAgent` / `includeSkill` / `includeSendMessage` / `includeRespondToCoordinator` / `includeSubmitResult` / `includeEscalate` |
| **task-control** (2) | `TaskOutput`, `TaskStop` | ✅ | 无（主会话必需，用于控制后台 Bash 任务） |
| **workflow** (10) | `CreateWorkflow`, `AmendWorkflow`, `SaveWorkflow`, `EvalWorkflowSnippet`, `ListSavedWorkflows`, `ListModels`, `ListWorkflowRuns`, `GetWorkflowRun`, `ResumeWorkflowRun`, `ResolveWorkflowQuestion` | ❌ | `includeDynamicWorkflow` |
| **js** (1) | `js` | ❌ | `includeNodeRepl` |
| **bot** (1) | `BotCommand` | ❌ | `includeBotCommand`（远程平台检测到时自动开启） |

> **Glob/Grep 核心地位**：
>> - Bash `find()`/`grep()` 首轮截断到 30k inline，超出需追加 Read 调用（浪费 token）
>> - Glob/Grep 提供**结构化 JSON 输出**、**权限集成**、**token 预算**，大型搜索必需
>> - Embedded search 是**补充能力**（快速纯文本），不是替代品
> 
> **工具名修正**：`submit_result` 和 `escalate` 使用下划线（与 contracts 一致），非驼峰。  
> **TaskOutput/TaskStop 独立分组**：主会话依赖它们控制后台 Bash 任务，不能放入 subagent 组默认关闭。

---

## 设计方案

### 1. 契约层：工具集规格（纯数据）

> **当前实现状态（2026-10-06）**：AgentRuntime 已启用延迟工具面。首轮仅注册 core、task-control 与 LoadToolSet；可选工具仍由现有 `LoadToolSet` handler 按会话注册并使缓存失效。调用方若显式不启用延迟模式，保留 eager registration 作为兼容行为。

**`apps/zcode-cli/packages/contracts/src/tool-sets.ts`**

```typescript
/** 工具集元数据（纯数据，无 ToolEntry 依赖） */
export interface ToolSetSpec {
  /** 唯一 ID，LoadToolSet 传这个 */
  id: string;
  /** 给模型看的描述（ToolSearch.description 会拼进去） */
  description: string;
  /** 搜索关键词 */
  keywords: string[];
  /** 该工具集包含的工具名（必须与 handlers 里工具名一致） */
  tools: string[];
  /** 默认激活（core + task-control 设 true） */
  defaultEnabled?: boolean;
}

/** 工具集运行时状态（core 层使用） */
export interface ToolSetState {
  spec: ToolSetSpec;
  loaded: boolean;
}
```

> **架构修正**：
> - `ToolSetSpec` 放 `contracts`（纯数据），不依赖 `core` 的 `ToolEntry`
> - 不放 `packages/shared`（那是 UI/protocol 共享层，不是契约层）
> - `load` 函数留在 `core` 层，不跨包传递

---

### 2. Registry 扩展：批量注册/注销工具集

**`apps/zcode-cli/packages/core/src/tool/registry.ts`** —— `ToolRegistryImpl` 类内新增

```typescript
import type { ToolSetSpec, ToolSetState } from '@zcode/contracts';

private toolSets = new Map<string, ToolSetState>();

/** 批量注册一个工具集的所有工具 */
registerToolSet(spec: ToolSetSpec, entries: ToolEntry[]): void {
  if (this.toolSets.has(spec.id)) return;
  for (const entry of entries) {
    this.register(entry, { silentDuplicateWarning: true });
  }
  this.toolSets.set(spec.id, { spec, loaded: true });
}

/** 批量注销一个工具集 */
unregisterToolSet(setId: string): void {
  const state = this.toolSets.get(setId);
  if (!state) return;
  for (const toolName of state.spec.tools) {
    this.unregister(toolName);
  }
  this.toolSets.delete(setId);
}

getToolSet(setId: string): ToolSetState | undefined {
  return this.toolSets.get(setId);
}

listToolSets(): ToolSetState[] {
  return Array.from(this.toolSets.values());
}

/** 供 ToolSearch 用：返回目录+加载状态（不暴露工具 schema） */
getToolSetCatalog(): { spec: ToolSetSpec; loaded: boolean }[] {
  return Array.from(this.toolSets.values()).map(s => ({
    spec: s.spec,
    loaded: s.loaded,
  }));
}
```

> **接口修正**：
> - `registerToolSet` 接受 `spec` 和 `entries` 两个参数（解耦 load 逻辑）
> - `unregisterToolSet` 按工具名注销（不依赖 entries 缓存）

---

### 3. 工具集目录：单一事实来源

**`apps/zcode-cli/packages/core/src/tool/handlers/tool-set-catalog.ts`**

```typescript
import type { ToolSetSpec } from '@zcode/contracts';
import type { ToolEntry } from '../types.js';

export interface ToolSetLoader {
  spec: ToolSetSpec;
  load: () => Promise<ToolEntry[]> | ToolEntry[];
}

export const builtInToolSetLoaders: ToolSetLoader[] = [
  {
    spec: {
      id: 'core',
      description: 'Core file/terminal/web operations and structured search (always active)',
      keywords: ['file', 'read', 'write', 'edit', 'bash', 'terminal', 'web', 'fetch', 'glob', 'grep', 'search', 'todo', 'task'],
      tools: ['Read', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch', 'TodoRead', 'TodoWrite', 'Glob', 'Grep'],
      defaultEnabled: true,
    },
    load: () => {
      const { readToolEntry, writeToolEntry, editToolEntry, bashToolEntry, 
              webFetchToolEntry, webSearchToolEntry, todoReadToolEntry, todoWriteToolEntry,
              globToolEntry, grepToolEntry } 
        = require('./index.js');
      return [readToolEntry, writeToolEntry, editToolEntry, bashToolEntry, 
              webFetchToolEntry, webSearchToolEntry, todoReadToolEntry, todoWriteToolEntry,
              globToolEntry, grepToolEntry];
    },
  },
  {
    spec: {
      id: 'task-control',
      description: 'Background task control (TaskOutput, TaskStop) - always active for main session',
      keywords: ['task', 'background', 'output', 'stop', 'control'],
      tools: ['TaskOutput', 'TaskStop'],
      defaultEnabled: true,
    },
    load: () => {
      const { taskOutputToolEntry, taskStopToolEntry } = require('./index.js');
      return [taskOutputToolEntry, taskStopToolEntry];
    },
  },
  {
    spec: {
      id: 'plan',
      description: 'Planning mode and user interaction tools',
      keywords: ['plan', 'planning', 'question', 'user', 'interaction'],
      tools: ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion'],
    },
    load: () => {
      const { enterPlanModeToolEntry, exitPlanModeToolEntry, askUserQuestionToolEntry } 
        = require('./index.js');
      return [enterPlanModeToolEntry, exitPlanModeToolEntry, askUserQuestionToolEntry];
    },
  },
  {
    spec: {
      id: 'automation',
      description: 'Scheduled and background task automation (cron, off-peak)',
      keywords: ['cron', 'schedule', 'automation', 'offpeak', 'background', 'timer'],
      tools: ['CronCreate', 'CronList', 'CronUpdate', 'CronDelete', 'OffPeakCreate', 'OffPeakList'],
    },
    load: () => {
      const { cronCreateToolEntry, cronListToolEntry, cronUpdateToolEntry, cronDeleteToolEntry, 
              offPeakCreateToolEntry, offPeakListToolEntry } = require('./index.js');
      return [cronCreateToolEntry, cronListToolEntry, cronUpdateToolEntry, cronDeleteToolEntry, 
              offPeakCreateToolEntry, offPeakListToolEntry];
    },
  },
  {
    spec: {
      id: 'session',
      description: 'AI session orchestration (create, send, read, stop, compact, permission)',
      keywords: ['session', 'orchestration', 'ai', 'agent', 'subagent', 'permission', 'model', 'create', 'send', 'read', 'stop', 'compact'],
      tools: ['CreateSession', 'SendSessionMessage', 'ReadSession', 'StopSessionGeneration', 'SetSessionModel', 'CompactSession', 'ResolveSessionPermission'],
    },
    load: () => {
      const mod = require('./index.js');
      return [mod.createSessionToolEntry, mod.sendSessionMessageToolEntry, mod.readSessionToolEntry,
              mod.stopSessionGenerationToolEntry, mod.setSessionModelToolEntry, mod.compactSessionToolEntry,
              mod.resolveSessionPermissionToolEntry];
    },
  },
  {
    spec: {
      id: 'subagent',
      description: 'Subagent/actor communication and coordination channels',
      keywords: ['agent', 'task', 'subagent', 'actor', 'message', 'coordinator', 'result', 'escalate', 'context'],
      tools: ['Agent', 'Task', 'Skill', 'SendMessage', 'RespondToCoordinator', 'submit_result', 'escalate', 'ReadSessionContext'],
    },
    load: () => {
      const mod = require('./index.js');
      return [mod.agentToolEntry, mod.taskToolEntry, mod.skillToolEntry, mod.sendMessageToolEntry,
              mod.respondToCoordinatorToolEntry, mod.submitResultToolEntry, mod.escalateToolEntry,
              mod.readSessionContextToolEntry];
    },
  },
  {
    spec: {
      id: 'workflow',
      description: 'Dynamic workflow orchestration (create, amend, save, list, resume runs)',
      keywords: ['workflow', 'orchestration', 'pipeline', 'automation', 'run', 'create', 'amend', 'save', 'list', 'get', 'resume'],
      tools: ['CreateWorkflow', 'AmendWorkflow', 'SaveWorkflow', 'EvalWorkflowSnippet', 'ListSavedWorkflows', 'ListModels', 'ListWorkflowRuns', 'GetWorkflowRun', 'ResumeWorkflowRun', 'ResolveWorkflowQuestion'],
    },
    load: () => {
      const mod = require('./index.js');
      return [mod.createWorkflowToolEntry, mod.amendWorkflowToolEntry, mod.saveWorkflowToolEntry,
              mod.evalWorkflowSnippetToolEntry, mod.listSavedWorkflowsToolEntry, mod.listModelsToolEntry, 
              mod.listWorkflowRunsToolEntry, mod.getWorkflowRunToolEntry, mod.resumeWorkflowRunToolEntry, 
              mod.resolveWorkflowQuestionToolEntry];
    },
  },
  {
    spec: {
      id: 'js',
      description: 'JavaScript/Node.js REPL execution',
      keywords: ['js', 'javascript', 'node', 'repl', 'eval', 'execute'],
      tools: ['js'],
    },
    load: () => {
      const { jsToolEntry } = require('./index.js');
      return [jsToolEntry];
    },
  },
  {
    spec: {
      id: 'bot',
      description: 'Remote platform command proxy (WeChat, Feishu, etc.) - auto-enabled when remote platform detected',
      keywords: ['bot', 'wechat', 'feishu', 'remote', 'mobile', 'command', 'proxy'],
      tools: ['BotCommand'],
    },
    load: () => {
      const { botCommandToolEntry } = require('./index.js');
      return [botCommandToolEntry];
    },
  },
];
```

> **关键修正**：
> - `load` 函数返回 `ToolEntry[]`（不是 `Promise`），使用同步 `require()`
> - `spec` 与 `load` 分离，`spec` 可独立传递到 UI/协议层
> - 工具名与 contracts 严格一致（`submit_result`、`escalate` 带下划线）

---

### 4. ToolSearch：只读入口，首轮直接给模型

**`apps/zcode-cli/packages/core/src/tool/handlers/tool-search.ts`**

```typescript
import type { ToolEntry, ToolExecutionContext, ToolHandler } from '../types.js';
import { builtInToolSetLoaders } from './tool-set-catalog.js';

function buildDescription(): string {
  const lines = builtInToolSetLoaders.map(({ spec }) => 
    `- ${spec.id}: ${spec.description} [keywords: ${spec.keywords.join(', ')}]${spec.defaultEnabled ? ' (default loaded)' : ''}`
  );
  return `Discover available built-in tool sets. Call LoadToolSet to activate a set.

Available tool sets:
${lines.join('\n')}

Usage:
1. ToolSearch({ query: "github" }) → see matching sets
2. LoadToolSet({ setId: "github" }) → activate (requires approval)
3. Then use tools directly (e.g., GhIssueList)`;
}

const execute: ToolHandler = async ({ query }, ctx: ToolExecutionContext) => {
  const registry = ctx.toolSetRegistryPort;
  if (!registry) {
    return { error: 'ToolSetRegistry port not available' };
  }
  
  const loadedSets = registry.listToolSets();
  const loadedMap = new Map(loadedSets.map(s => [s.spec.id, s.loaded]));
  
  const q = query.toLowerCase();
  const matches = builtInToolSetLoaders
    .map(({ spec }) => spec)
    .filter(s => !q || s.id.includes(q) || s.description.toLowerCase().includes(q) || s.keywords.some(k => k.includes(q)))
    .map(s => ({
      id: s.id,
      description: s.description,
      keywords: s.keywords,
      tools: s.tools,
      defaultEnabled: s.defaultEnabled,
      loaded: loadedMap.get(s.id) ?? false,
    }));
    
  return { toolSets: matches };
};

export const toolSearchToolEntry: ToolEntry = {
  metadata: {
    name: 'ToolSearch',
    description: buildDescription(),
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    needsApproval: false,
    sideEffectScope: 'none',
    riskLevel: 'low',
    providerVisible: true,
  },
  capability: { type: 'function' },
  executionMode: 'client',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to filter tool sets (empty = list all)' },
    },
    required: [],
  },
  execute,
};
```

> **架构修正**：
> - `executionMode: 'client'`（不是 `'local'`，那不是有效值）
> - `ctx.toolSetRegistryPort` 端口注入（不是 `ctx.runtime.registry`）
> - 必需的元数据字段补全（`destructive`、`riskLevel`）

---

### 5. LoadToolSet：写入口，需权限，防 child 挂起

**`apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts`**

```typescript
import type { ToolEntry, ToolExecutionContext, ToolHandler } from '../types.js';
import { builtInToolSetLoaders } from './tool-set-catalog.js';

const execute: ToolHandler = async ({ setId }, ctx: ToolExecutionContext) => {
  const loader = builtInToolSetLoaders.find(l => l.spec.id === setId);
  if (!loader) {
    return { success: false, error: `Unknown tool set: ${setId}` };
  }
  
  const registry = ctx.toolSetRegistryPort;
  if (!registry) {
    return { success: false, error: 'ToolSetRegistry port not available' };
  }
  
  const existing = registry.getToolSet(setId);
  if (existing?.loaded) {
    return { success: true, message: `Tool set "${setId}" already loaded`, tools: loader.spec.tools };
  }
  
  // 懒加载工具条目
  const entries = loader.load();
  registry.registerToolSet(loader.spec, entries);
  
  // **缓存失效必需步骤**：模型下一轮请求才能看到新工具
  const runtimePort = ctx.agentRuntimePort;
  if (runtimePort) {
    runtimePort.invalidateToolCache();
  }
  
  return { success: true, message: `Loaded tool set "${setId}"`, tools: loader.spec.tools };
};

export const loadToolSetToolEntry: ToolEntry = {
  metadata: {
    name: 'LoadToolSet',
    description: `Activate a built-in tool set for the current session.
Once loaded, all tools in that set become available for direct use.
Requires user approval (modifies session tool surface).`,
    destructive: false,
    readOnly: false,
    concurrentSafe: false,
    needsApproval: true,      // 修改工具面需要用户确认
    sideEffectScope: 'session',
    riskLevel: 'medium',
    providerVisible: true,
  },
  capability: { type: 'function' },
  executionMode: 'client',
  inputSchema: {
    type: 'object',
    properties: {
      setId: { type: 'string', description: 'Tool set ID from ToolSearch results' },
    },
    required: ['setId'],
  },
  execute,
};
```

> **关键修正**：
> - `ctx.toolSetRegistryPort` 和 `ctx.agentRuntimePort` 端口注入
> - **调用 `invalidateToolCache()`**（MCP 先例：`runtime/methods/mcp.ts:147`）
> - `concurrentSafe: false`（修改全局注册表不可并发）
> - `riskLevel: 'medium'`（修改会话工具面）

---

### 6. 端口定义：ToolSetRegistry 与 AgentRuntime

**`apps/zcode-cli/packages/contracts/src/tool-registry-port.ts`** (新文件)

```typescript
import type { ToolSetSpec, ToolSetState } from './tool-sets.js';

export interface ToolSetRegistryPort {
  registerToolSet(spec: ToolSetSpec, entries: unknown[]): void;
  unregisterToolSet(setId: string): void;
  getToolSet(setId: string): ToolSetState | undefined;
  listToolSets(): ToolSetState[];
}
```

**`apps/zcode-cli/packages/contracts/src/agent-runtime-port.ts`** (新文件)

```typescript
export interface AgentRuntimePort {
  invalidateToolCache(): void;
}
```

**`apps/zcode-cli/packages/core/src/tool/types.ts`** —— `ToolExecutionContext` 新增

```typescript
export interface ToolExecutionContext {
  // ... 现有 50+ 字段
  /** 工具集注册端口；ToolSearch/LoadToolSet 经此访问 ToolRegistry */
  toolSetRegistryPort?: ToolSetRegistryPort;
  /** Agent 运行时端口；LoadToolSet 用它失效工具缓存 */
  agentRuntimePort?: AgentRuntimePort;
}
```

> **架构修正**：
> - 端口放 `contracts`（跨包契约）
> - 避免 `ctx.runtime` 直接暴露（那会打破封装）
> - 与现有端口注入模式一致（`executionPort`、`skillPort` 等）

---

### 7. 启动时：自动加载默认工具集 + 元工具

**`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`** —— 修改 `registerBuiltInTools`

```typescript
import { builtInToolSetLoaders } from './tool-set-catalog.js';
import { toolSearchToolEntry } from './tool-search.js';
import { loadToolSetToolEntry } from './load-tool-set.js';

export function registerBuiltInTools(
  registry: ToolRegistry,
  options: RegisterBuiltInToolsOptions = {},
): void {
  // 1. 先注册两个元工具（永远可见）
  registry.register(toolSearchToolEntry);
  registry.register(loadToolSetToolEntry);

  // 2. 自动加载 defaultEnabled: true 的工具集（core + task-control）
  for (const loader of builtInToolSetLoaders) {
    if (loader.spec.defaultEnabled) {
      const entries = loader.load();
      registry.registerToolSet(loader.spec, entries);
    }
  }

  // 3. 原有的 includeAgent/includeSkill 等门控逻辑保留，针对非默认工具集
  //    例如：includeZCodeTask 控制 session 工具集是否可被 LoadToolSet 加载
  //    实现：在 ToolSearch.execute 里过滤未开启的工具集
  // ...
}
```

> **保持同步**：不改为 `async`（`load` 函数是同步的）

---

### 8. Workflow Child 防护：防止权限挂起

**`apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts`** —— 修改 `WORKFLOW_CHILD_DISALLOWED_TOOLS`

```typescript
const WORKFLOW_CHILD_DISALLOWED_TOOLS = [
  CREATE_WORKFLOW_TOOL_NAME,
  AMEND_WORKFLOW_TOOL_NAME,
  SAVE_WORKFLOW_TOOL_NAME,
  RESUME_WORKFLOW_RUN_TOOL_NAME,
  RESOLVE_WORKFLOW_QUESTION_TOOL_NAME,
  // **LoadToolSet 同样声明 needsApproval: true**，在 child yolo 模式下会发出父界面
  // 看不到的确认请求并挂到权限超时（与 CreateWorkflow 同根因）。
  'LoadToolSet',  // ← 新增
] as const;
```

> **血泪教训复现**：`tool-allowlist.ts:20-22` 注释已记录这个坑。

---

### 9. 双入口同步：runtime-tools + embedded-search-branch

**`apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts`** (启动入口)

```typescript
import { registerBuiltInTools } from '../../tool/handlers/index.js';

export function setupRuntimeTools(runtime: AgentRuntimeInternal): void {
  const registry = runtime.registry;
  registerBuiltInTools(registry, {
    embeddedSearchEnabled: runtime.config.embeddedSearchEnabled ?? true,
    includeAgent: runtime.config.includeAgent,
    includeZCodeTask: runtime.config.includeZCodeTask,
    // ... 其他门控
  });
}
```

**`apps/zcode-cli/packages/core/src/runtime/methods/embedded-search-branch.ts`** (shell 快照初始化)

```typescript
// 注入 embedded search 时，无需隐藏 Glob/Grep，只需注入 find()/grep() shell function
export function refreshToolsForEmbeddedSearch(runtime: AgentRuntimeInternal): void {
  // embedded search 分支只处理 shell function 注入，不触碰工具注册
  // Glob/Grep 工具继续驻留在 registry 中，模型可根据需要选择：
  // - 快速纯文本搜索 → 用 Bash find()/grep()
  // - 结构化/权限敏感搜索 → 用 Glob/Grep 工具
  
  // shell prelude 由 ExecutionPort 负责注入，不在此处处理
  // 缓存失效：仅当工具集改变时才需要
  // 因为 embedded search 不改变可用工具集，所以无需调用 invalidateToolCache()
}
```

> **关键修正**：
> - embedded search 分支**不隐藏 Glob/Grep**
> - **不清空 registry**，工具集状态保持一致
> - shell function 注入由 ExecutionPort 负责，registry 无需干预
> - Glob/Grep 始终保留，模型可混合使用两种搜索策略

---

## 模型交互流程

```
User: "帮我查一下定时任务怎么配置"

Model: [调用 ToolSearch({ query: "cron" })]
→ 返回: { 
    toolSets: [{ 
      id: "automation", 
      description: "Scheduled and background task automation...", 
      tools: ["CronCreate", "CronList", ...], 
      loaded: false 
    }] 
  }

Model: [调用 LoadToolSet({ setId: "automation" })]
→ 权限弹窗 → 用户批准
→ 返回: { success: true, tools: ["CronCreate", "CronList", ...] }
→ runtime.invalidateToolCache() 被调用

Model: [调用 CronCreate({ schedule: "0 2 * * *", command: "backup.sh" })]
→ 返回创建结果
```

**后续轮次**：`CronCreate` 已在 `registry`，模型直接调用，**无需再次 LoadToolSet**。

---

## 状态持久化与会话隔离

| 维度 | 行为 |
|------|------|
| **会话级** | `ToolRegistry` 实例属于单个 `AgentRuntime`，随会话生命周期。会话结束销毁，新会话重新启动只加载 `defaultEnabled` 集 |
| **跨会话不共享** | 会话 A 加载了 automation，会话 B 仍需自己 `LoadToolSet` |
| **远程会话** | `workspaceIdentity` 隔离，远程 Host 维护自己的 `ToolRegistry`，本地只转发工具调用 |
| **重连恢复** | Desktop continuous：`ToolRegistry` 内存态随进程存活；Web replayable：接受丢失（重连需重新 LoadToolSet，可接受） |

> **不新增快照字段**：`loadedToolSetIds` 是可重建状态，不需持久化。接受重连后需重新加载的代价。

---

## 权限模型

| 工具 | 风险等级 | 审批 | 副作用范围 |
|------|---------|------|-----------|
| `ToolSearch` | 低 | 无 | 只读元数据 |
| `LoadToolSet` | 中 | **需审批** | 修改当前会话工具面（用户可见、可撤销） |
| 工具集内工具 | 各自原有等级 | 各自原有规则 | 不变 |

> **Child 防护**：`LoadToolSet` 进 `WORKFLOW_CHILD_DISALLOWED_TOOLS`，避免权限挂起。

---

## Token 成本对比

| 方案 | 首轮工具定义 token | 机制 |
|------|-------------------|------|
| 现状（48 个全量） | ~20k | 全塞给模型 |
| **ToolSearch + LoadToolSet + core(10) + task-control(2)** | **~7k** | 2 个元工具 + 12 个默认工具 + 目录文本 |
| 按需加载后 | +每集 ~1k | 模型用到时再 LoadToolSet |

> **成本解析**：
> - Glob/Grep 在 core 中默认加载，但与 Read/Bash 比，结构化搜索结果开销相对固定
> - 大型搜索时，Glob/Grep 的结构化结果避免追加 Read 调用，总体 token 更效率

---

## 验收场景

1. **冷启动**：新会话只看到 `ToolSearch`、`LoadToolSet` + `core` 10 个工具（含 Glob/Grep）+ `task-control` 2 个工具，token ~7k
2. **Glob/Grep 可用**：默认加载，提供结构化搜索、权限集成、token 预算
3. **Embedded Search 补充**：`embeddedSearchEnabled: true` 时，Bash 同步注入 `find()`/`grep()` shell function 加速纯文本搜索
4. **混合搜索策略**：
   - 快速纯文本 → 用 Bash `find()` 或 `grep()`
   - 大型结构化搜索 → 用 Glob/Grep 工具（避免追加 Read 调用）
   - 权限敏感操作 → 必须用 Glob/Grep（权限集成）
5. **按需加载**：模型搜 "cron" → 加载 automation 集 → 后续轮次直接用 `CronCreate`
6. **持久驻留**：同一会话第 2 次用 automation 工具，无需再次 LoadToolSet
7. **权限拦截**：用户拒绝 LoadToolSet → 模型收到拒绝，不能调用该集工具
8. **会话隔离**：会话 A 加载了 session，会话 B 不受影响
9. **BotCommand 自动门控**：本地 CLI 无 BotsServicePort → 不注册；远程手机连接有 BotsServicePort → 注册 BotCommand
10. **远程透传**：远程会话加载工具集，本地只转发调用，不维护工具注册表
11. **Child 防护**：workflow child 调用 `LoadToolSet` → 直接拒绝（工具不可用），不挂起
12. **缓存失效**：LoadToolSet 后，模型下一个请求能看到新工具（`invalidateToolCache()` 生效）
13. **双入口一致**：切换 embedded search 分支后，工具集状态正确重建，Glob/Grep 始终保留

---

## 实现文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `apps/zcode-cli/packages/contracts/src/tool-sets.ts` | 新增 | `ToolSetSpec`、`ToolSetState` 数据定义 |
| `apps/zcode-cli/packages/contracts/src/tool-registry-port.ts` | 新增 | `ToolSetRegistryPort` 端口契约 |
| `apps/zcode-cli/packages/contracts/src/agent-runtime-port.ts` | 新增 | `AgentRuntimePort` 端口契约 |
| `apps/zcode-cli/packages/core/src/tool/handlers/tool-set-catalog.ts` | 新增 | 工具集目录 + 加载器 |
| `apps/zcode-cli/packages/core/src/tool/handlers/tool-search.ts` | 新增 | `ToolSearch` handler |
| `apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts` | 新增 | `LoadToolSet` handler |
| `apps/zcode-cli/packages/core/src/tool/types.ts` | 修改 | `ToolExecutionContext` 新增端口字段 |
| `apps/zcode-cli/packages/core/src/tool/registry.ts` | 修改 | `ToolRegistryImpl` 新增工具集管理方法 |
| `apps/zcode-cli/packages/core/src/tool/handlers/index.ts` | 修改 | `registerBuiltInTools` 加载默认工具集 + 元工具 |
| `apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts` | 修改 | `WORKFLOW_CHILD_DISALLOWED_TOOLS` 加入 `LoadToolSet` |
| `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts` | 修改 | 启动时注册工具集（传 embeddedSearchEnabled） |
| `apps/zcode-cli/packages/core/src/runtime/methods/embedded-search-branch.ts` | 修改 | 切换分支时重新注册工具集 + 失效缓存 |
| `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts` | 修改 | 实现 `AgentRuntimePort`，注入 `toolSetRegistryPort` |

---

## 依赖与阻塞

- 无外部依赖，纯内部接线
- 需运行 `pnpm --filter @zcode/contracts run build` 生成 dist
- 需运行 `pnpm typecheck && pnpm lint` 通过
- 需运行 `pnpm architecture:check` 验证无循环依赖
- **不阻塞**：现有 48 个工具 handler 不动、权限流不动、协议不动

---

## 与现有能力的关系

| 能力 | 关系 |
|------|------|
| `Skill` | 正交。Skill 是「可安装的扩展包」，ToolSet 是「内置工具分组」。Skill 安装后可注册为新 ToolSet |
| `MCP` | 正交。MCP 工具走 `mcp_handler_cache.appendMcpTools()` 另一条管道 |
| `DynamicWorkflow` | 正交。Workflow 工具集是内置工具集之一（`includeDynamicWorkflow` 门控） |
| `OffPeak` / `Cron` / `BotCommand` | 同机制：受 `includeXxx` 开关控制的工具集 |
| `Embedded Search` | 补充能力：Bash `find()`/`grep()` 加速纯文本搜索，与 Glob/Grep 工具并存 |

---

## 失败语义

- `LoadToolSet` 权限被拒 → 返回 `{ success: false, error: "permission denied" }`，不注册任何工具
- `LoadToolSet` 加载器抛错 → 返回 `{ success: false, error: "load failed: ..." }`，回滚不注册
- `ToolSearch` 查询无结果 → 返回 `{ toolSets: [] }`，不报错
- 工具集 ID 冲突 → `registerToolSet` 幂等，已加载直接返回成功
- Workflow child 调用 `LoadToolSet` → 直接拒绝（`WORKFLOW_CHILD_DISALLOWED_TOOLS` 拦截）

---

## 后续扩展（Phase 2+）

| 扩展 | 说明 |
|------|------|
| `UnloadToolSet` | 对称卸载工具集，释放 token 预算 |
| `ToolSet` 版本化 | 工具集元数据带版本，支持热更新不重启会话 |
| 远程工具集发现 | 从远程 Host 拉取可用工具集目录 |
| 工具集依赖图 | `dependsOn: ['core']` 自动级联加载 |
| UI 侧边栏管理 | 用户可在 UI 点击启用/禁用工具集，不依赖模型调用 |
| 快照持久化 | `loadedToolSetIds: string[]` 存入快照，远程重连自动恢复 |
