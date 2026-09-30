# 内置工具动态加载机制

## 目标

解决现状：40+ 内置工具全量注册，首轮上下文占用 20k+ token。引入 **ToolSearch + LoadToolSet** 双工具协作，实现：

- **首轮仅暴露 2 个元工具 + core 8 个工具**（~5k token）
- **模型按需加载工具集**，加载后永久驻留当前会话 ToolRegistry
- **未加载的工具集，模型完全不可见、不可调用**

---

## 核心原则

| 原则 | 说明 |
|------|------|
| **内置工具分组** | 现有 42 个工具按领域分为 9 个工具集，每集 3-10 个工具 |
| **静态目录、动态注册** | 工具集元数据（名字、描述、关键词、包含工具）编译期固化；运行时按需批量注册 |
| **会话级持久** | 一次 `LoadToolSet` 后，该工具集的工具永久留在当前 `AgentRuntime` 的 `ToolRegistry`，后续轮次直接可用 |
| **无加载 = 不可见** | 未加载的工具集：**不在 `registry.list()`、不在 `registry.toContracts()`、模型 schema 里没有、ToolSearch 也只返回元数据不返回可调用 schema** |
| **复用现有架构** | 复用 `ToolRegistry.register/unregister`、`registerBuiltInTools` 门控机制、`ToolExecutionContext` 传播、`needsApproval` 权限流 |
| **Glob/Grep 隐藏** | 开启 `embeddedSearchEnabled: true`，由 Bash `find()`/`grep()` shell function 接管，不再单独注册 |
| **Read 保留** | 多模态、缓存、结构化输出、权限集成等 Bash 无法替代的能力 |

---

## 架构现状

| 层级 | 组件 | 状态 |
|------|------|------|
| **Registry** | `ToolRegistryImpl` (`packages/core/src/tool/registry.ts`) | ✅ 单例，随 `AgentRuntime` 生命周期 |
| **注册入口** | `registerBuiltInTools` (`packages/core/src/tool/handlers/index.ts`) | ✅ 启动时一次性注册所有内置工具 |
| **工具定义** | 42 个 `ToolEntry` 分散在 `handlers/*.ts` | ✅ 已有 |
| **运行时上下文** | `ToolExecutionContext.runtime.registry` | ✅ handler 可访问 |
| **权限流** | `needsApproval` + `PermissionBroker` | ✅ 完整 |
| **Embedded Search** | `embeddedSearchEnabled` 开关隐藏 Glob/Grep，Bash 注入 `find()`/`grep()` | ✅ 已实现 |

---

## 最终分组方案（9 组，42 个工具）

| 组名 | 工具列表 | 默认 | 门控开关 |
|------|---------|------|---------|
| **core** (8) | `Read`, `Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite` | ✅ | 无 |
| **plan** (3) | `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion` | ❌ | 无 |
| **automation** (6) | `CronCreate`, `CronList`, `CronUpdate`, `CronDelete`, `OffPeakCreate`, `OffPeakList` | ❌ | `includeAutomation` / `includeOffPeak` |
| **session** (7) | `CreateSession`, `SendSessionMessage`, `ReadSession`, `StopSessionGeneration`, `SetSessionModel`, `CompactSession`, `ResolveSessionPermission` | ❌ | `includeZCodeTask` |
| **subagent** (10) | `Agent`, `Task`, `Skill`, `SendMessage`, `RespondToCoordinator`, `SubmitResult`, `Escalate`, `TaskOutput`, `TaskStop`, `ReadSessionContext` | ❌ | `includeAgent` / `includeSkill` / `includeSendMessage` / `includeRespondToCoordinator` / `includeSubmitResult` / `includeEscalate` |
| **workflow** (10) | `CreateWorkflow`, `AmendWorkflow`, `SaveWorkflow`, `EvalWorkflowSnippet`, `ListSavedWorkflows`, `ListModels`, `ListWorkflowRuns`, `GetWorkflowRun`, `ResumeWorkflowRun`, `ResolveWorkflowQuestion` | ❌ | `includeDynamicWorkflow` |
| **js** (1) | `js` | ❌ | `includeNodeRepl` |
| **bot** (1) | `BotCommand` | ❌ | `includeBotCommand`（远程平台检测到时自动开启） |

> **Glob/Grep**：不再注册，走 `embeddedSearchEnabled: true` 分支，由 Bash `find()`/`grep()` 接管。

---

## 设计方案

### 1. 共享层：工具集规格（编译期常量）

**`packages/shared/src/tool-sets.ts`**

```typescript
import type { ToolEntry } from '../core/src/tool/types.js';

export interface ToolSetSpec {
  /** 唯一 ID，LoadToolSet 传这个 */
  id: string;
  /** 给模型看的描述（ToolSearch.description 会拼进去） */
  description: string;
  /** 搜索关键词 */
  keywords: string[];
  /** 该工具集包含的工具名（必须与 handlers 里工具名一致） */
  tools: string[];
  /** 默认激活（仅 core 设 true） */
  defaultEnabled?: boolean;
  /** 懒加载器：返回 ToolEntry[] */
  load: () => Promise<ToolEntry[]>;
}

export interface ToolSetState {
  spec: ToolSetSpec;
  loaded: boolean;
  toolEntries: ToolEntry[];
}
```

> **放在 `shared` 的理由**：UI、CLI、Web 可能需要读取工具集目录做展示/配置，不能耦合 `core` 实现。

---

### 2. Registry 扩展：批量注册/注销工具集

**`packages/core/src/tool/registry.ts`** —— `ToolRegistryImpl` 类内新增

```typescript
import type { ToolSetState } from '@zcode/shared/tool-sets.js';

private toolSets = new Map<string, ToolSetState>();

/** 批量注册一个工具集的所有工具 */
registerToolSet(state: ToolSetState): void {
  if (this.toolSets.has(state.spec.id)) return;
  for (const entry of state.toolEntries) {
    this.register(entry, { silentDuplicateWarning: true });
  }
  this.toolSets.set(state.spec.id, state);
}

/** 批量注销一个工具集 */
unregisterToolSet(setId: string): void {
  const state = this.toolSets.get(setId);
  if (!state) return;
  for (const entry of state.toolEntries) {
    this.unregister(entry.metadata.name);
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

---

### 3. 工具集目录：单一事实来源

**`packages/core/src/tool/handlers/tool-set-catalog.ts`**

```typescript
import type { ToolSetSpec } from '@zcode/shared/tool-sets.js';

export const builtInToolSets: ToolSetSpec[] = [
  {
    id: 'core',
    description: 'Core file/terminal/web operations and task tracking (always active)',
    keywords: ['file', 'read', 'write', 'edit', 'bash', 'terminal', 'web', 'fetch', 'search', 'todo', 'task'],
    tools: ['Read', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch', 'TodoRead', 'TodoWrite'],
    defaultEnabled: true,
    load: async () => {
      const { readToolEntry, writeToolEntry, editToolEntry, bashToolEntry, webFetchToolEntry, webSearchToolEntry, todoReadToolEntry, todoWriteToolEntry } 
        = await import('./index.js');
      return [readToolEntry, writeToolEntry, editToolEntry, bashToolEntry, webFetchToolEntry, webSearchToolEntry, todoReadToolEntry, todoWriteToolEntry];
    },
  },
  {
    id: 'plan',
    description: 'Planning mode and user interaction tools',
    keywords: ['plan', 'planning', 'question', 'user', 'interaction'],
    tools: ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion'],
    load: async () => {
      const { enterPlanModeToolEntry, exitPlanModeToolEntry, askUserQuestionToolEntry } 
        = await import('./index.js');
      return [enterPlanModeToolEntry, exitPlanModeToolEntry, askUserQuestionToolEntry];
    },
  },
  {
    id: 'automation',
    description: 'Scheduled and background task automation (cron, off-peak)',
    keywords: ['cron', 'schedule', 'automation', 'offpeak', 'background', 'timer'],
    tools: ['CronCreate', 'CronList', 'CronUpdate', 'CronDelete', 'OffPeakCreate', 'OffPeakList'],
    load: async () => {
      const { cronCreateToolEntry, cronListToolEntry, cronUpdateToolEntry, cronDeleteToolEntry, offPeakCreateToolEntry, offPeakListToolEntry } 
        = await import('./index.js');
      return [cronCreateToolEntry, cronListToolEntry, cronUpdateToolEntry, cronDeleteToolEntry, offPeakCreateToolEntry, offPeakListToolEntry];
    },
  },
  {
    id: 'session',
    description: 'AI session orchestration (create, send, read, stop, compact, permission)',
    keywords: ['session', 'orchestration', 'ai', 'agent', 'subagent', 'permission', 'model', 'create', 'send', 'read', 'stop', 'compact'],
    tools: ['CreateSession', 'SendSessionMessage', 'ReadSession', 'StopSessionGeneration', 'SetSessionModel', 'CompactSession', 'ResolveSessionPermission'],
    load: async () => {
      const mod = await import('./index.js');
      return [mod.createSessionToolEntry, mod.sendSessionMessageToolEntry, mod.readSessionToolEntry,
              mod.stopSessionGenerationToolEntry, mod.setSessionModelToolEntry, mod.compactSessionToolEntry,
              mod.resolveSessionPermissionToolEntry];
    },
  },
  {
    id: 'subagent',
    description: 'Subagent/actor communication and coordination channels',
    keywords: ['agent', 'task', 'subagent', 'actor', 'message', 'coordinator', 'result', 'escalate', 'output', 'stop', 'context'],
    tools: ['Agent', 'Task', 'Skill', 'SendMessage', 'RespondToCoordinator', 'SubmitResult', 'Escalate', 'TaskOutput', 'TaskStop', 'ReadSessionContext'],
    load: async () => {
      const mod = await import('./index.js');
      return [mod.agentToolEntry, mod.taskToolEntry, mod.skillToolEntry, mod.sendMessageToolEntry,
              mod.respondToCoordinatorToolEntry, mod.submitResultToolEntry, mod.escalateToolEntry,
              mod.taskOutputToolEntry, mod.taskStopToolEntry, mod.readSessionContextToolEntry];
    },
  },
  {
    id: 'workflow',
    description: 'Dynamic workflow orchestration (create, amend, save, list, resume runs)',
    keywords: ['workflow', 'orchestration', 'pipeline', 'automation', 'cron', 'schedule', 'run', 'create', 'amend', 'save', 'list', 'get', 'resume'],
    tools: ['CreateWorkflow', 'AmendWorkflow', 'SaveWorkflow', 'EvalWorkflowSnippet', 'ListSavedWorkflows', 'ListModels', 'ListWorkflowRuns', 'GetWorkflowRun', 'ResumeWorkflowRun', 'ResolveWorkflowQuestion'],
    load: async () => {
      const mod = await import('./index.js');
      return [mod.createWorkflowToolEntry, mod.amendWorkflowToolEntry, mod.saveWorkflowToolEntry,
              mod.listSavedWorkflowsToolEntry, mod.listModelsToolEntry, mod.listWorkflowRunsToolEntry,
              mod.getWorkflowRunToolEntry, mod.resumeWorkflowRunToolEntry, mod.resolveWorkflowQuestionToolEntry];
    },
  },
  {
    id: 'js',
    description: 'JavaScript/Node.js REPL execution',
    keywords: ['js', 'javascript', 'node', 'repl', 'eval', 'execute'],
    tools: ['js'],
    load: async () => {
      const { jsToolEntry } = await import('./index.js');
      return [jsToolEntry];
    },
  },
  {
    id: 'bot',
    description: 'Remote platform command proxy (WeChat, Feishu, etc.) - auto-enabled when remote platform detected',
    keywords: ['bot', 'wechat', 'feishu', 'remote', 'mobile', 'command', 'proxy'],
    tools: ['BotCommand'],
    load: async () => {
      const { botCommandToolEntry } = await import('./index.js');
      return [botCommandToolEntry];
    },
  },
];
```

---

### 4. ToolSearch：只读入口，首轮直接给模型

**`packages/core/src/tool/handlers/tool-search.ts`**

```typescript
import type { ToolEntry } from '../types.js';
import { builtInToolSets } from './tool-set-catalog.js';

function buildDescription(): string {
  const lines = builtInToolSets.map(s => 
    `- ${s.id}: ${s.description} [keywords: ${s.keywords.join(', ')}]${s.defaultEnabled ? ' (default loaded)' : ''}`
  );
  return `Discover available built-in tool sets. Call LoadToolSet to activate a set.

Available tool sets:
${lines.join('\n')}

Usage:
1. ToolSearch({ query: "github" }) → see matching sets
2. LoadToolSet({ setId: "github" }) → activate (requires approval)
3. Then use tools directly (e.g., GhIssueList)`;
}

export const toolSearchToolEntry: ToolEntry = {
  metadata: {
    name: 'ToolSearch',
    description: buildDescription(),
    readOnly: true,
    concurrentSafe: true,
    sideEffectScope: 'none',
    providerVisible: true,
  },
  capability: { type: 'function' },
  executionMode: 'local',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to filter tool sets (empty = list all)' },
    },
    required: ['query'],
  },
  execute: async ({ query }, ctx) => {
    const registry = ctx.runtime.registry;
    const loadedSets = registry.listToolSets();
    const loadedMap = new Map(loadedSets.map(s => [s.spec.id, s.loaded]));
    
    const q = query.toLowerCase();
    const matches = builtInToolSets
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
  },
};
```

**关键点**：
- `description` 里**静态列出所有工具集摘要**（id、description、keywords、是否默认加载）
- 返回值只包含**元数据**，不包含工具的输入 schema
- `providerVisible: true` → 始终出现在 `registry.toContracts()` → 模型首轮可见

---

### 5. LoadToolSet：写入口，需权限

**`packages/core/src/tool/handlers/load-tool-set.ts`**

```typescript
import type { ToolEntry } from '../types.js';
import { builtInToolSets } from './tool-set-catalog.js';

export const loadToolSetToolEntry: ToolEntry = {
  metadata: {
    name: 'LoadToolSet',
    description: `Activate a built-in tool set for the current session.
Once loaded, all tools in that set become available for direct use.
Requires user approval (modifies session tool surface).`,
    destructive: false,
    readOnly: false,
    needsApproval: true,      // 修改工具面需要用户确认
    sideEffectScope: 'session',
    providerVisible: true,
  },
  capability: { type: 'function' },
  executionMode: 'local',
  inputSchema: {
    type: 'object',
    properties: {
      setId: { type: 'string', description: 'Tool set ID from ToolSearch results' },
    },
    required: ['setId'],
  },
  execute: async ({ setId }, ctx) => {
    const spec = builtInToolSets.find(s => s.id === setId);
    if (!spec) {
      return { success: false, error: `Unknown tool set: ${setId}` };
    }
    const registry = ctx.runtime.registry;
    const existing = registry.getToolSet(setId);
    if (existing?.loaded) {
      return { success: true, message: `Tool set "${setId}" already loaded`, tools: spec.tools };
    }
    // 懒加载工具条目
    const entries = await spec.load();
    const state = { spec, loaded: true, toolEntries: entries };
    registry.registerToolSet(state);
    return { success: true, message: `Loaded tool set "${setId}"`, tools: spec.tools };
  },
};
```

**关键点**：
- `needsApproval: true` → 触发现有 `PermissionBroker` 流程，用户确认后才注册
- 成功后调用 `registry.registerToolSet()` 批量注册，**永久驻留当前 `AgentRuntime`**
- 返回 `tools: string[]` 告知模型「现在可以用这些工具名了」

---

### 6. 启动时：自动加载默认工具集 + 元工具

**`packages/core/src/tool/handlers/index.ts`** —— 修改 `registerBuiltInTools`

```typescript
import { builtInToolSets } from './tool-set-catalog.js';
import { toolSearchToolEntry } from './tool-search.js';
import { loadToolSetToolEntry } from './load-tool-set.js';

export async function registerBuiltInTools(
  registry: ToolRegistry,
  options: RegisterBuiltInToolsOptions = {},
): Promise<void> {
  // 1. 先注册两个元工具（永远可见）
  registry.register(toolSearchToolEntry);
  registry.register(loadToolSetToolEntry);

  // 2. 自动加载 defaultEnabled: true 的工具集（core）
  for (const spec of builtInToolSets) {
    if (spec.defaultEnabled) {
      const entries = await spec.load();
      registry.registerToolSet({ spec, loaded: true, toolEntries: entries });
    }
  }

  // 3. 原有的 includeAgent/includeSkill 等门控逻辑保留，针对非默认工具集
  //    例如：includeZCodeTask 控制 session 工具集是否可被 LoadToolSet 加载
  // ...
}
```

> **改为 `async`**：因为懒加载器是 `Promise<ToolEntry[]>`，启动时需 await。

---

### 7. 门控集成：复用现有 `includeXxx` 开关

在 `RegisterBuiltInToolsOptions` 里现有开关直接映射到工具集：

```typescript
interface RegisterBuiltInToolsOptions {
  // ... 现有字段
  includeAutomation?: boolean;      // automation 工具集
  includeOffPeak?: boolean;         // automation 工具集（OffPeak*）
  includeZCodeTask?: boolean;       // session 工具集
  includeAgent?: boolean;           // subagent 工具集
  includeSkill?: boolean;           // subagent 工具集
  includeSendMessage?: boolean;     // subagent 工具集
  includeRespondToCoordinator?: boolean; // subagent 工具集
  includeSubmitResult?: boolean;    // subagent 工具集
  includeEscalate?: boolean;        // subagent 工具集
  includeDynamicWorkflow?: boolean; // workflow 工具集
  includeNodeRepl?: boolean;        // js 工具集
  includeBotCommand?: boolean;      // bot 工具集（远程平台检测到时由 Host 自动传 true）
  embeddedSearchEnabled?: boolean;  // 隐藏 Glob/Grep，Bash 接管
  // ...
}
```

在 `tool-search.ts` 的 `execute` 里过滤：对应开关为 `false` 时隐藏该工具集。

**BotCommand 特殊逻辑**：
```typescript
// bootstrap/server-operations.ts 装配时
includeBotCommand: !!deps.botsServicePort  // 只有远程平台注入 BotsServicePort 时为 true
```

---

### 8. Embedded Search 默认开启

**`packages/core/src/tool/handlers/index.ts`** 调用处：

```typescript
// bootstrap 或 CLI 入口传递
registerBuiltInTools(registry, { 
  embeddedSearchEnabled: true,  // 默认开启，隐藏 Glob/Grep
  ...otherOptions 
})
```

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
| **重连恢复** | Desktop continuous：`ToolRegistry` 内存态随进程存活；Web replayable：需在会话快照里持久化 `loadedToolSetIds: string[]`，重连时重放加载 |

---

## 权限模型

| 工具 | 风险等级 | 审批 | 副作用范围 |
|------|---------|------|-----------|
| `ToolSearch` | 低 | 无 | 只读元数据 |
| `LoadToolSet` | 中 | **需审批** | 修改当前会话工具面（用户可见、可撤销） |
| 工具集内工具 | 各自原有等级 | 各自原有规则 | 不变 |

> **撤销**：后续可提供 `UnloadToolSet` 工具（对称），同样需审批。或用户在 UI 侧边栏点击卸载。

---

## Token 成本对比

| 方案 | 首轮工具定义 token | 机制 |
|------|-------------------|------|
| 现状（40+ 全量） | ~20k | 全塞给模型 |
| **ToolSearch + LoadToolSet + core** | **~5k** | 2 个元工具 + core 8 个工具 + 目录文本 |
| 按需加载后 | +每集 ~1k | 模型用到时再 LoadToolSet |

---

## 验收场景

1. **冷启动**：新会话只看到 `ToolSearch`、`LoadToolSet` + `core` 8 个工具，token < 6k
2. **Glob/Grep 隐藏**：`embeddedSearchEnabled: true` 时，模型不见 Glob/Grep，用 Bash `find()`/`grep()` 替代
3. **按需加载**：模型搜 "cron" → 加载 automation 集 → 后续轮次直接用 `CronCreate`
4. **持久驻留**：同一会话第 2 次用 automation 工具，无需再次 LoadToolSet
5. **权限拦截**：用户拒绝 LoadToolSet → 模型收到拒绝，不能调用该集工具
6. **会话隔离**：会话 A 加载了 session，会话 B 不受影响
7. **BotCommand 自动门控**：本地 CLI 无 BotsServicePort → 不注册；远程手机连接有 BotsServicePort → 注册 BotCommand
8. **远程透传**：远程会话加载工具集，本地只转发调用，不维护工具注册表

---

## 实现顺序

| 步骤 | 交付 | 预估 |
|------|------|------|
| 1 | `packages/shared/src/tool-sets.ts` | 10 min |
| 2 | `packages/core/src/tool/handlers/tool-set-catalog.ts`（按上表分组） | 30 min |
| 3 | `packages/core/src/tool/registry.ts` 扩展 `registerToolSet` 等 | 15 min |
| 4 | `tool-search.ts` / `load-tool-set.ts` 两个 handler | 20 min |
| 5 | `handlers/index.ts` 修改 `registerBuiltInTools`（改 async、自动加载 core、注册元工具） | 15 min |
| 6 | 启动入口默认传 `embeddedSearchEnabled: true` | 5 min |
| 7 | Contracts schema 同步（`ToolSearch`、`LoadToolSet` 入 `@zcode/contracts`） | 10 min |
| 8 | `pnpm typecheck && pnpm lint` 通过 | 5 min |
| 9 | 手动验证：新会话 token 数、LoadToolSet 流程、会话隔离、Glob/Grep 隐藏 | 20 min |

---

## 依赖与阻塞

- 无外部依赖，纯内部接线
- 需同步更新 `packages/contracts/src/tools/` 新增两个工具 schema
- 需运行 `pnpm --filter @zcode/contracts run build` 生成 dist
- **不阻塞**：现有 42 个工具 handler 不动、权限流不动、协议不动

---

## 与现有能力的关系

| 能力 | 关系 |
|------|------|
| `Skill` | 正交。Skill 是「可安装的扩展包」，ToolSet 是「内置工具分组」。Skill 安装后可注册为新 ToolSet |
| `MCP` | 正交。MCP 工具走 `mcp_handler_cache.appendMcpTools()` 另一条管道 |
| `DynamicWorkflow` | 正交。Workflow 工具集是内置工具集之一（`includeDynamicWorkflow` 门控） |
| `OffPeak` / `Cron` / `BotCommand` | 同机制：受 `includeXxx` 开关控制的工具集 |
| `Embedded Search` | 互斥：开启时隐藏 Glob/Grep，Bash 接管搜索 |

---

## 失败语义

- `LoadToolSet` 权限被拒 → 返回 `{ success: false, error: "permission denied" }`，不注册任何工具
- `LoadToolSet` 加载器抛错 → 返回 `{ success: false, error: "load failed: ..." }`，回滚不注册
- `ToolSearch` 查询无结果 → 返回 `{ toolSets: [] }`，不报错
- 工具集 ID 冲突 → `registerToolSet` 幂等，已加载直接返回成功

---

## 后续扩展（Phase 2+）

| 扩展 | 说明 |
|------|------|
| `UnloadToolSet` | 对称卸载工具集，释放 token 预算 |
| `ToolSet` 版本化 | 工具集元数据带版本，支持热更新不重启会话 |
| 远程工具集发现 | 从远程 Host 拉取可用工具集目录 |
| 工具集依赖图 | `dependsOn: ['core']` 自动级联加载 |
| UI 侧边栏管理 | 用户可在 UI 点击启用/禁用工具集，不依赖模型调用 |