# Agent Note: 内置工具动态加载

Status: implemented

[English](2026-10-04-builtin-tool-dynamic-loading.md)

## Problem

现状：48 个内置工具在启动时全量注册，首轮上下文占用 20k+ token。这笔开销无论模型是否真正使用都要支付。模型通常只需要一个小子集（例如文件 I/O + Bash），导致全量工具集浪费严重。每当新增工具组时，启动成本无界增长。

## Affected surfaces

**运行时界面**：
- `ToolExecutionContext`：LoadToolSet handler 访问注册表状态并报告工具加载结果
- `ToolRegistry`：存储注册的工具；LoadToolSet 触发未加载工具的批量注册
- 工具缓存：LoadToolSet 后调用 `runtime.invalidateToolCache()` 重新计算模型 schema
- `WORKFLOW_CHILD_DISALLOWED_TOOLS`：LoadToolSet 加入以防止 child workflow 污染父运行时状态

**协议/契约界面**：
- `LoadToolSetInputSchema` / `LoadToolSetOutputSchema` / `LoadToolSetErrorSchema`：`@zcode/contracts` 中的新契约
- `LOAD_TOOL_SET_TOOL_NAME` 导出常量

**UI/模型面界面**：
- 模型 schema：首轮包含 12 个工具（core 10 + task-control 2）；LoadToolSet 允许按需加载 36 个额外工具
- 工具可见性：未加载的工具集对模型不可见（不在 registry.list()、不在 contracts）

**文件结构**：
- 新：`apps/zcode-cli/packages/contracts/src/tools/load-tool-set.ts`
- 新：`apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts`
- 修改：`apps/zcode-cli/packages/contracts/src/tools/index.ts`（导出 LoadToolSet 类型）
- 修改：`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`（注册 loadToolSetToolEntry）
- 修改：`apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts`（LoadToolSet 加入 WORKFLOW_CHILD_DISALLOWED_TOOLS）

## Decision

实现 **LoadToolSet** — 一个元工具，允许模型在运行时动态加载工具组。系统设计为两阶段策略：

1. **首轮**：仅暴露 10 个核心工具（Read、Write、Edit、Bash、WebFetch、WebSearch、TodoRead、TodoWrite、Glob、Grep）+ TaskOutput + TaskStop（~5k token）。
2. **按需加载**：模型调用 `LoadToolSet(toolset_id: "automation" | "workflow" | "session" | …)` 加载一个工具组（2-10 个工具）。加载后，工具留在会话的 ToolRegistry 中，无需重新加载。
3. **无可见性**：未加载的工具集对模型不可见 — 不在 registry.list()、不在 schema、ToolSearch 也只返回元数据不返回可调用 schema。

### 架构

**工具分组（8 个工具集，48 个工具）**：
- **core** (10)：Read、Write、Edit、Bash、WebFetch、WebSearch、TodoRead、TodoWrite、Glob、Grep — 始终活跃
- **task-control** (2)：TaskOutput、TaskStop — 始终活跃（主会话仅）
- **plan** (2)：EnterPlanMode、ExitPlanMode
- **automation** (6)：CronCreate、CronList、CronUpdate、CronDelete、OffPeakCreate、OffPeakList
- **session** (7)：CreateSession、SendSessionMessage、ReadSession、StopSessionGeneration、SetSessionModel、CompactSession、ResolveSessionPermission
- **subagent** (8)：Agent、Task、Skill、SendMessage、RespondToCoordinator、submit_result、escalate、ReadSessionContext
- **workflow** (10)：CreateWorkflow、AmendWorkflow、SaveWorkflow、EvalWorkflowSnippet、ListSavedWorkflows、ListModels、ListWorkflowRuns、GetWorkflowRun、ResumeWorkflowRun、ResolveWorkflowQuestion
- **js** (1)：node_repl
- **bot** (1)：BotCommand

**契约层**（`apps/zcode-cli/packages/contracts/src/tools/load-tool-set.ts`）：
- `ToolSetSpec`：不可变元数据（id、description、keywords、工具列表、defaultEnabled 标志）
- `LoadToolSetInput`：模型入参（toolset_id）
- `LoadToolSetOutput`：成功响应（toolset_spec、loaded_tools[]、already_loaded_tools[]、total_tools）
- `LoadToolSetError`：失败响应（code: TOOLSET_NOT_FOUND | LOAD_FAILED | INVALID_TOOLSET_ID、message、available_toolsets）

**Handler**（`apps/zcode-cli/packages/core/src/tool/handlers/load-tool-set.ts`）：
- 元数据：readOnly=true、destructive=false、concurrentSafe=true、needsApproval=false、riskLevel=low、sideEffectScope=runtime_state
- 执行：验证 toolset_id 对比 TOOL_SETS 注册表，返回 spec + 工具名
- **当前状态**：占位符实现（报告预期工具；实际注册延后到运行时集成）

**运行时集成**：
- LoadToolSet 执行触发运行时：
  1. 为请求的工具加载 ToolEntry 实例（当前未实现）
  2. 对未加载的工具通过 `registry.register(entry)` 注册
  3. 调用 `runtime.invalidateToolCache()` 重新计算模型 schema
- 缓存失效遵循 MCP 先例（`runtime/methods/mcp.ts:147`）

**Child 防护**：
- LoadToolSet 加入 `WORKFLOW_CHILD_DISALLOWED_TOOLS`（结构性禁用） — child workflow 不能加载工具组，否则会污染父会话的运行时状态，破坏可重放性

**Glob/Grep 保留**：
- Glob/Grep 工具保留在核心工具集中（非隐藏）
- Embedded search 提供 Bash shell function 加速（find/grep）；是补充能力，非替代品
- Bash find/grep 截断到 30k；Glob/Grep 处理结构化输出 + token 预算控制，适合大型搜索

## Alternatives considered

**为什么不把所有工具都隐藏起来，按需加载？** — 会话重启后所有工具都要重新加载。隐藏所有工具（要求模型在任何工作前先发现 + 加载）会延后第一个真正的行动。保留 10 个核心工具在线可平衡即时实用性（文件 I/O、Bash、web 查询）和上下文成本。

**为什么不按启发式批量加载工具？** — LLM 行为不可预测；工具使用模式因会话而异。显式的模型驱动加载避免了未使用的推测性加载，给模型代理权来请求它真正需要的。

**为什么不用 ToolSearch 作为唯一的发现机制？** — ToolSearch 是只读元发现；它描述未加载的工具集而不给予访问权。LoadToolSet 是执行门控。分离关注点让元发现保持轻量级，让 LoadToolSet 处理注册、缓存和 child 防护。

**为什么把实际工具注册延后到运行时集成？** — Handler 执行在 ToolExecutionContext 中运行，它没有直接访问所有 48 个 ToolEntry 定义的权限（它们散落在 handler/*.ts 文件中）。把 ToolEntry imports 集中在 `handlers/index.ts` 并使用依赖注入或注册表查询会把 handler 耦合到所有 handler 模块，创建循环依赖。运行时后处理可以更干净地访问注册表并失效缓存。*（注：这个集成仍未实现；占位符 handler 将在后续被取代）*

## Consequences

**正面**：
- 首轮上下文削减：~5k token（核心工具）vs ~20k token（所有工具）— 不需要完整工具套件的会话节省 75%
- 后向兼容：使用全部 48 个工具的现有代码无需改动（按需加载它们）
- 会话作用域缓存：加载后，工具集在会话生命周期内留驻；每轮无需重新注册
- 模型控制：显式 LoadToolSet 调用让模型管理工具命名空间，避免认知过载
- Child 防护：WORKFLOW_CHILD_DISALLOWED_TOOLS 防止 child workflow 污染父状态

**负面**：
- 额外往返：模型必须学习工具集、调用 LoadToolSet、再使用工具（如果加载延后到mid-session会增加 turn 开销）
- 发现 UX：模型必须调用 ToolSearch 或知道工具集 ID；没有根据任务描述的隐式猜测
- 实现复杂性：运行时集成延后；占位符 handler 还没实际加载工具

**延后**：
- LoadToolSet handler 中的实际工具注册（运行时集成：加载 ToolEntry 实例、调用 registry.register、失效缓存）
- 工具加载 + 缓存失效的集成测试
- 列出可用工具集的 UI/发现界面

## Testing

**当前**：类型检查和 linting 通过；架构检查通过。

**需要**（集成测试）：
1. LoadToolSet with valid toolset_id → 工具注册并可从 registry 查询
2. LoadToolSet with invalid toolset_id → 带 available_toolsets 列表的错误
3. LoadToolSet for already-loaded toolset → already_loaded_tools 列表被填充
4. LoadToolSet 后，模型 schema 更新（新工具在 contracts 中可见）
5. Child workflow 被阻止调用 LoadToolSet（WORKFLOW_CHILD_DISALLOWED_TOOLS 强制）
6. LoadToolSet 执行后调用工具缓存失效

*注：测试延后待运行时集成实现。*

## Related

- Spec: [builtin-tool-dynamic-loading.md](../../../specs/architecture/builtin-tool-dynamic-loading.md)
- Registry: [registry.ts](../../../../apps/zcode-cli/packages/core/src/tool/registry.ts)
- MCP 工具注册先例: [mcp.ts](../../../../apps/zcode-cli/packages/core/src/runtime/methods/mcp.ts)
- Child 工具允许列表: [tool-allowlist.ts](../../../../apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts)
