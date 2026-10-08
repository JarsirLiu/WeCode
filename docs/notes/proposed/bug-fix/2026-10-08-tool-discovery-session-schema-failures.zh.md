# Agent Note: 修复工具发现与会话编排契约故障

Status: proposed

[English](2026-10-08-tool-discovery-session-schema-failures.md) | 中文

## Problem

2026-10-08，会话 `sess_c7e3d172-33a2-413c-855c-54180296f73f` 中模型需要用户提醒才能发现工具集，随后猜错工具集 ID，并反复遇到被报告为 schema 错误的会话管理工具失败。运行日志位于 `C:\Users\341596\.zcode\cli\log\zcode-2026-10-08.jsonl`。

## Root cause

运行时延迟工具面的首轮注册了 `LoadToolSet`，却没有注册 `ToolSearch` 或 `ListToolSets`。`LoadToolSet` 要求精确的 `toolset_id`；参数描述指向不存在的 `ListToolSets`，工具自身描述也没有目录或可搜索的分类。01:05:33，模型请求加载 `conversation`，handler 拒绝该 ID 并列出了有效 ID（`core`、`task-control`、`plan`、`automation`、`session`、`subagent`、`workflow`、`js`、`bot`）。这是工具发现契约缺失，不是 provider 未收到已注册工具的证据。

同一工具目录被重复维护：工具集到工具的映射位于 `load-tool-set.ts`，工具条目位于 `tool-catalog.ts`，架构 spec 也描述了一份目录。这会允许定义漂移，也解释了为什么文档提到的发现能力在运行时并不存在。

`ListSessions` 的输出契约与 handler 返回值不兼容。`ListSessionsOutputSchema` 要求每个条目包含顶层 `workspacePath` 和一组简化状态；但 `ZCodeSessionPort.listSessions()` 返回共享的 `ZCodeSessionInfo`，其工作区字段嵌套在 `workspace` 下，并使用 `sessionKind` 和协议状态。handler 将对象原样返回。01:10:13、01:10:17 和 01:10:25，executor 因 `runtimeOutputSchema validation` 拒绝结果，错误为 `Required`。通用错误未包含失败字段路径，掩盖了这一不匹配。

01:10:10 和 01:10:17 的 `ReadSession` 也因目标 session `Session is not active` 而失败。现有证据能确认读取路径当时无法服务该目标，但无法确认目标是否已持久化、是否具备冷恢复能力，以及哪些生命周期状态应该可读。需要针对性复现后才能判断问题属于工具语义、Host 路由还是 runtime 恢复。

## Proposal

提供一个真实且始终可见的发现工具，搜索 `LoadToolSet` 所用的同一权威目录，并返回有效工具集 ID、描述、工具名、可用性和加载状态。修正 `LoadToolSet` 描述，使其指向真实发现工具及准确的输入字段。删除重复的工具集成员定义，或由单一来源生成。

让 `ListSessions` 输出与共享的 `ZCodeSessionInfo` 契约一致，或在 handler 边界显式投影为已文档化的工具结果形状。不要用 catch-all 字段放宽校验来掩盖必需字段缺失。输出校验诊断应保留字段路径。

针对 active、已完成但已持久化、已归档和刚创建的 session 复现 `ReadSession`。随后明确工具应冷恢复持久化 session，还是返回结构化的不可读状态；仅实现现有 Host 所有权和恢复契约所支持的行为。

## Fix

后续修正：`ReadSession` 未显式传入 `messageLimit` 时统一返回最近 20 条消息；Host 回退投影与工具 handler 使用同一默认值。前端 identity 同时识别 PascalCase 内部工具名和 MCP snake_case 工具名，并将 `WorkspaceList`、`ListSessions` 纳入会话编排专用 renderer，避免会话工具落入参数/结果/raw JSON 兜底卡。

第一阶段已实现工具发现修复：新增并注册首轮可见的 `ToolSearch`，它与 `LoadToolSet` 共用同一工具集目录；搜索结果返回精确工具集 ID、描述、关键词、工具名和加载状态。`LoadToolSet` 参数描述改为指向 `ToolSearch`，并添加无密钥回放测试覆盖首轮注册和 session 工具集搜索。

第二阶段已实现：`ListSessions` 在 runtime 校验前将共享的 `ZCodeSessionInfo` 投影为文档定义的扁平摘要，并增加无密钥 handler/schema 测试。runtime Zod 校验诊断现在包含失败字段路径（例如 `$.sessions[0].workspacePath: Required`）。

第三阶段明确并实现 `ReadSession` 生命周期：目标会话不要求正在执行或驻留 runtime。读取时先复用正式 `session/resume` 的激活流程；已完成、空闲和冷存储但仍有持久化记录的会话均可读取。持久化记录不存在时返回 `Session not found`，恢复失败保留恢复错误，避免把“runtime 未驻留”误报为“会话不可读”。

第四阶段将 `ReadSession` 工具边界收紧为摘要视图：Host 仍可构建完整内部快照，但模型只收到会话状态、计数、上下文压力、消息文本预览，以及工具名、调用 ID、状态和时间；完整工具输入、输出和内部 metadata 不再通过该工具返回。摘要投影在 core handler 边界完成，并有无密钥回放测试防止泄露。

第五阶段补齐动态工具发现 UI：`ToolSearch` 与 `LoadToolSet` 及其 MCP snake_case 别名登记到独立 `tool-discovery` family，使用结构化摘要 renderer，避免历史和新会话中的工具调用继续显示参数、结果和 raw JSON 三段兜底内容。

第六阶段修正模型侧发现提示：`ToolSearch` 的 provider-facing description 与 `LoadToolSet` 共用同一权威 catalog，列出工具集 ID、用途和包含的工具，并明确“当前工具面没有所需能力时先搜索，再用精确 ID 加载”的调用顺序。仅写“搜索工具集”不足以让模型知道何时调用发现工具。

## 工作区会话列表后续修复

2026-10-08 08:36:58 的回放日志确认，`ListSessions` 调用成功，但实际返回空载荷 `{"sessions":[]}`（15 字节）。工具结果已传回模型，因此这次不是单纯的 UI 展示遗漏。模型同时传入了本地工作区路径和 workspace identity；协议先按路径读取存储会话，随后用 `(workspace_id || path || directory) === workspaceIdentity` 二次过滤。旧本地会话的 `workspace_id = NULL`，目录路径与 workspace identity 比较不相等，导致记录被全部过滤。

修复继续由协议服务端负责持久会话列表。本地工作区在旧记录缺少 workspace identity 时允许按请求路径匹配；远程 identity 包含连接边界，因此仍要求 `workspace_id` 精确匹配。本次将 `WorkspaceList` 纳入 session 工具集及动态工具目录，让模型从权威索引发现工作区；`ListSessions` 专属 UI renderer 显示会话数量和每条会话的标题、ID、状态，空列表也明确显示数量 0。

## 后续设计收敛：单一加载入口

复核后确认当前目录只有少量静态内置工具集，`ToolSearch` 仅对同一目录做关键词过滤，既不加载工具，也不返回可调用 schema。把目录完整放进 provider-facing 描述后，搜索步骤不再提供额外信息，只多一次模型工具往返。因此取消新 runtime 中的 `ToolSearch`，由 `LoadToolSet` 描述直接列出工具集及其功能/工具；需要缺失能力时直接按精确 `toolset_id` 加载，下一轮生效。保留旧 `ToolSearch` 的 UI identity/renderer 仅用于历史会话回放。新增无密钥测试校验单工具入口、模型描述和工具加载流程。静态 catalog 与各工具的 runtime capability gate 并非同一机制；本次不声称已解决 feature gate 与工具集成员的细粒度对齐，需在后续逐工具审查中单独处理。

## Affected surfaces

提案涉及 CLI runtime 工具注册与 handler、`@zcode/contracts` 工具 schema、共享 session info 协议契约、Host session 路由/恢复，以及动态工具和 AI 会话 spec。不提议增加第二份 session 存储或新的 session 状态所有权路径。

## Alternatives considered

- **继续依赖模型记忆或用户提醒：**拒绝，因为模型侧契约没有可发现目录，而且已将模型引向不存在的工具。
- **只新增静态 `ListToolSets` 列表：**拒绝，倾向于对权威目录提供可搜索发现，避免再维护一份独立清单。
- **放宽 `ListSessions` 输出校验：**拒绝，因为这会掩盖跨层结构不匹配，并在没有稳定结果形状的情况下削弱模型契约。
- **把每个 `Session is not active` 都视为冷恢复缺陷：**拒绝，因为给定日志没有证明目标已持久化或具备恢复能力；应先复现并确认预期行为。

## Acceptance criteria

- 模型无需用户提示或预先知道 ID，即可从首轮延迟工具面发现 session 工具集及其准确 ID。
- 加载参数描述指向已注册的发现能力；无效 ID 提供可操作的提示。
- 空结果和非空结果均通过 session 列表 handler 的 runtime 与 JSON Schema 校验。
- `ReadSession` 对任意已知会话可读；冷恢复复用既有 session resume 生命周期，错误能区分目标不存在和恢复失败，不伪报成功。
- 测试无需凭据，并实际走 handler/port 契约，而非仅使用彼此隔离的 mock schema fixture。
- 无 `workspace_id` 的本地旧会话仍可按精确本地路径列出；远程会话仍按精确 identity 隔离。
- `ListSessions` 结果以结构化列表显示在工具卡中，不再被空的专属 renderer 隐藏。

## Risks

暴露完整工具集目录会略微增加提示上下文，也可能泄露受门控的工具集；发现结果必须基于同一运行时门控区分“可发现”和“可加载”。更改会话列表结果可能影响模型提示和调用方，因此投影必须明确记录。为读取而冷恢复 session 可能产生副作用或成本；在所有权、持久化和 runtime 恢复语义得到验证前，不应引入该行为。
