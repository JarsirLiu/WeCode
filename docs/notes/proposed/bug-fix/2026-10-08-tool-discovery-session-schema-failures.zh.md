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

第一阶段已实现工具发现修复：新增并注册首轮可见的 `ToolSearch`，它与 `LoadToolSet` 共用同一工具集目录；搜索结果返回精确工具集 ID、描述、关键词、工具名和加载状态。`LoadToolSet` 参数描述改为指向 `ToolSearch`，并添加无密钥回放测试覆盖首轮注册和 session 工具集搜索。

第二阶段已实现：`ListSessions` 在 runtime 校验前将共享的 `ZCodeSessionInfo` 投影为文档定义的扁平摘要，并增加无密钥 handler/schema 测试。runtime Zod 校验诊断现在包含失败字段路径（例如 `$.sessions[0].workspacePath: Required`）。

第三阶段明确并实现 `ReadSession` 生命周期：目标会话不要求正在执行或驻留 runtime。读取时先复用正式 `session/resume` 的激活流程；已完成、空闲和冷存储但仍有持久化记录的会话均可读取。持久化记录不存在时返回 `Session not found`，恢复失败保留恢复错误，避免把“runtime 未驻留”误报为“会话不可读”。

第四阶段将 `ReadSession` 工具边界收紧为摘要视图：Host 仍可构建完整内部快照，但模型只收到会话状态、计数、上下文压力、消息文本预览，以及工具名、调用 ID、状态和时间；完整工具输入、输出和内部 metadata 不再通过该工具返回。摘要投影在 core handler 边界完成，并有无密钥回放测试防止泄露。

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

## Risks

暴露完整工具集目录会略微增加提示上下文，也可能泄露受门控的工具集；发现结果必须基于同一运行时门控区分“可发现”和“可加载”。更改会话列表结果可能影响模型提示和调用方，因此投影必须明确记录。为读取而冷恢复 session 可能产生副作用或成本；在所有权、持久化和 runtime 恢复语义得到验证前，不应引入该行为。
