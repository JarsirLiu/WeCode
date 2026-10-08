# Agent Note: ReadSession 跨工作区路由

Status: proposed

English | [中文](2026-10-08-read-session-cross-workspace-routing.md)

## Problem

`ReadSession` 接受全局唯一的 session ID，但当前 Agent broker 通过内存中的 `context.sessions` 反查目标工作区。这个 map 只包含调用方 Agent 进程内常驻的 runtime，因此别的工作区会话或已冷却的持久化会话，会在 Host 读取之前就失败。Host 已经具备普通读取请求按需启动 workspace agent 的能力；缺少的是目标 session 定位能力。

## Proposal

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

## Affected surfaces

- Agent broker 和 `session/readSession` 反向协议请求结构。
- Host 的 `ZCodeTaskServiceExecutor` / `IZCodeSessionService` 分发，以及目标 session 定位器依赖。
- 全局 session/task 索引的持久化和按 session ID 查询。
- `packages/services/src/zcode-agent/zcodeAgentService.ts` 现有 workspace runtime 选择逻辑。
- ReadSession handler 契约保持不变；其 UI 改动与本提案独立。
- 跨工作区、冷会话和远程会话 replayable 测试。

## Alternatives considered

- **要求 ReadSession 工具输入增加 `workspacePath` 或 `workspaceIdentity`。** 不采用。session ID 已经标识目标，公开第二个路由键会引入不一致和过期身份问题；内部路由仍可携带解析后的身份。
- **遍历所有工作区查找 session ID。** 不采用。延迟和远程副作用会随工作区数量增长，不可用的远程工作区也会拖慢无关读取。
- **要求目标 runtime 始终活跃。** 不采用。这会浪费常驻进程资源，也违背现有 `start-if-needed` 读取路径和冷会话持久化模型。
- **不启动目标 runtime，直接从全局 SessionStore 读取消息。** 首阶段不采用。`ReadSession` 返回 runtime 派生的快照、上下文使用量、工具调用状态和待处理权限；绕过 runtime 会产生第二套不一致投影。

## Acceptance criteria

1. 创建者在工作区 A 中，只传目标 session ID，就能读取工作区 B 创建的会话。
2. 目标 runtime 可以不存在；Host 定位工作区 B，启动或复用只读 client 并返回快照。
3. runtime 被回收后，已完成或空闲的持久化会话仍可读取。
4. 远程目标精确使用 `workspaceIdentity` 和 `remoteSessionId`；相同路径的远程工作区不能混淆。
5. 未知、删除或无法定位的 ID 返回结构化 `sessionUnavailable`/not-found 错误，不扫描或启动无关工作区。
6. 授权根据调用方会话与目标会话关系判断；不能把全局 ID 唯一性当成授权。
7. 活跃且同工作区的读取保持当前低延迟路径。

## Risks

定位器会成为新的 Host 路由事实，必须跟随会话创建、导入、fork、旧远程身份修复和删除保持同步。定位器过期时必须显式失败，不能回退到调用方工作区或 `process.cwd()`。冷读取和远程重连可能明显慢于活跃读取，因此需要取消、有限超时和明确诊断。
