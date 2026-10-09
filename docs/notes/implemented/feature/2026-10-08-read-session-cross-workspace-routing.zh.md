# Agent Note: ReadSession 跨工作区路由

Status: implemented

English | [中文](2026-10-08-read-session-cross-workspace-routing.md)

## Problem

`ReadSession` 接受全局唯一的 session ID，但当前 Agent broker 通过内存中的 `context.sessions` 反查目标工作区。这个 map 只包含调用方 Agent 进程内常驻的 runtime，因此别的工作区会话或已冷却的持久化会话，会在 Host 读取之前就失败。Host 已经具备普通读取请求按需启动 workspace agent 的能力；缺少的是目标 session 定位能力。

## Decision

保留 `ReadSession` 的公开输入：`sessionId`、`messageLimit` 和 `afterSeq`。增加由 Host 持有的目标 session 定位链路：

```text
ReadSession(sessionId)
  → Agent broker 发送 targetSessionId 和调用方身份
  → Host 从全局 session/task 索引解析目标工作区
  → Host 校验调用方与目标会话的关系
  → Host 使用目标工作区调用 IZCodeSessionService.readSession
  → zcodeAgentService 复用或按需启动该工作区 runtime
  → 目标 runtime 读取持久化快照/事件投影
```

定位器是 Host 内的一次索引查询，不能扫描所有工作区。权威记录在会话创建或索引同步时写入，包含目标 `workspaceIdentity`（本地工作区为空时使用 `workspacePath`）、适用的远程 session identity 和 session ID。继续由现有 `getReadOnlyClient(..., "start-if-needed")` 持有 runtime 生命周期：`ReadSession` 不要求目标 runtime 常驻，也不创建第二个 runtime 或轮询队列。

反向协议必须把调用方 session ID 与 `targetSessionId` 分开传递。Host 使用定位器结果路由目标工作区，调用方 ID 只用于授权和审计。目标 runtime 返回现有 `readSession` 的持久化快照语义；尚未提交的模型输出不保证可见。

### 传输与状态所有者边界

“反向请求”只描述控制面请求方向：CLI Agent 正在执行 AI 工具时，通过现有双向 stdio 协议向 Host 发请求。它不引入第二套会话加载实现。全局目标定位、调用方授权、工作区路由和服务分发仍由 Host 所有；`IZCodeSessionService.readSession` 与 `IZCodeTaskService` 仍是 Host 的唯一服务入口。

请求必须保留两套身份：

```text
callerSessionId  → 受信上下文、授权、审计、trace
targetSessionId  → 全局索引定位和目标操作
```

broker 必须使用调用方 session 构造受信 workspace context。不能把 `targetSessionId` 传给 `requireSession` 或等价的常驻 runtime 查询；目标会话可能是冷会话、位于另一个工作区，或位于另一个 Agent 进程。Host 定位目标工作区后，调用与桌面 UI 相同的 service 路径。因此，同工作区目标走现有低延迟路径，被回收的目标走现有 `start-if-needed` 和 `session/read` 冷恢复生命周期。

协议保持双向、多路复用：Host 处理 Agent 的反向请求时，可以向目标 Agent runtime 发普通的 `session/read` 或 task 命令，再把结果返回到原来的反向请求。该过程不创建轮询队列，也不创建第二个 runtime。

## Implementation status

Host task index 已按 `task_id` 直接定位；broker 使用调用方 session 构造受信上下文；Host executor 在分发前解析并校验目标，再把目标 workspace 交给既有 session/task service。因此 ReadSession 和目标 task 操作复用目标 workspace 以及现有 start-if-needed runtime 生命周期。

实现文件包括 `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/zcode-session-broker.ts`、`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/browser-control-broker.ts`、`packages/services/src/zcode-agent/zcodeTaskServiceExecutorFactory.ts`、`packages/services/src/zcode-agent/taskTargetResolver.ts`、`packages/services/src/zcode-agent/zcodeTaskCommandExecutor.ts` 和 `packages/services/src/zcode-agent/zcodeTaskSessionRelay.ts`。无密钥回放测试位于 `packages/services/test/wecodeSessionRoutingReplay.test.ts` 与 `packages/services/test/wecodeTaskTargetRouting.test.ts`；服务包测试无需凭据即可通过。

## Affected surfaces

- Agent broker 和 `session/readSession` 反向协议请求结构。
- Host 的 `ZCodeTaskServiceExecutor` / `IZCodeSessionService` 分发，以及目标 session 定位器依赖。
- 全局 session/task 索引的持久化和按 session ID 查询。
- `packages/services/src/zcode-agent/zcodeAgentService.ts` 现有 workspace runtime 选择逻辑。
- ReadSession handler 契约保持不变；其 UI 改动与本提案独立。
- 运行时和快照事实源继续复用桌面端的 `IZCodeSessionService.readSession`；不新增 CLI-only 或 Host-only 的第二套投影。
- 跨工作区、同工作区冷会话、远程会话、授权和嵌套反向请求 replayable 测试。

## Alternatives considered

- **要求 ReadSession 工具输入增加 `workspacePath` 或 `workspaceIdentity`。** 不采用。session ID 已经标识目标，公开第二个路由键会引入不一致和过期身份问题；内部路由仍可携带解析后的身份。
- **遍历所有工作区查找 session ID。** 不采用。延迟和远程副作用会随工作区数量增长，不可用的远程工作区也会拖慢无关读取。
- **要求目标 runtime 始终活跃。** 不采用。这会浪费常驻进程资源，也违背现有 `start-if-needed` 读取路径和冷会话持久化模型。
- **不启动目标 runtime，直接从全局 SessionStore 读取消息。** 首阶段不采用。`ReadSession` 返回 runtime 派生的快照、上下文使用量、工具调用状态和待处理权限；绕过 runtime 会产生第二套不一致投影。

## Consequences

已实现的链路满足这些验收条件：调用方和目标身份分开；Host 在服务分发前完成定位和关系授权；冷读取复用目标 runtime 的 start-if-needed 路径；远程 identity 与 relation 中的 remote session identity 在目标操作中保持；无密钥回放测试覆盖 caller/target 分离、目标 workspace 路由、远程 caller identity、未知/歧义和未授权目标。代价是 Host task index 和 peer relation 数据必须持续同步，未知、删除和未授权目标才能 fail-closed。

定位器会成为新的 Host 路由事实，必须跟随会话创建、导入、fork、旧远程身份修复和删除保持同步。定位器过期时必须显式失败，不能回退到调用方工作区或 `process.cwd()`。冷读取和远程重连可能明显慢于活跃读取，因此需要取消、有限超时和明确诊断。嵌套请求必须保持多路复用并支持取消，避免 Agent 工具请求挂住 Host 到目标 runtime 的请求。
