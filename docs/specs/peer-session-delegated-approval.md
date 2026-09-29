# 平级会话与审批委托

## 目标

让当前会话中的 AI 能够创建一个真正独立、持久化、用户可见的平级会话，并在本地或已连接的远程 workspace 上执行任务、收发消息、读取进度；目标会话遇到审批时，允许按显式策略由用户或创建者 AI 处理。

目标会话不是 subagent：

- 有独立的 `sessionId`、runtime、工具面和历史记录。
- 出现在用户侧边栏，可被用户直接打开、暂停、继续、关闭和审批。
- 创建者会话结束后仍可继续运行。
- 创建关系只用于授权、审计和关联，不形成父子生命周期。

## 非目标

- 不把 Agent runtime 搬进 Desktop Host，不消除进程隔离。
- 不让 AI 通过普通消息文本隐式批准权限请求。
- 不由 relay 保存任务队列、会话快照或审批事实。
- 不把临时 subagent 与用户可见的持久会话合并。

## 现状与问题

现有会话编排已经提供 `CreateSession`、`SendSessionMessage`、`ReadSession` 等工具，Agent 通过 broker 反向请求 Host 的 `IZCodeTaskService` / `IZCodeSessionService`。目标会话遇到审批时，Host 能产生 `pendingPermissions` 并将会话置为等待状态，但当前没有“创建者 AI 解析指定审批请求”的控制面。

`yolo` 只能绕过大部分审批，不能视为 AI 审批；`send_session_message` 也不能替代对具体 `requestId` 的审批响应。

## 核心架构

```text
创建者 Agent 进程
  │ CreateSession / SendSessionMessage / ReadSession
  ▼
创建者 Host broker
  │ workspaceIdentity + remoteSessionId 路由
  ├── 本地 IZCodeTaskService / IZCodeSessionService
  └── 远程 Host 的同等服务
          │
          ▼
      平级目标会话 Agent
          │ permission.request
          ▼
      目标 Host 的审批状态
          ├── 用户 UI 处理
          └── 创建者 AI 通过显式授权处理
```

Agent 与 Host 之间仍是独立进程和双向协议。反向 request 负责调用 Host 服务；后续可增加 Host → Agent notification 作为唤醒机制，但 `ReadSession` 始终是权威状态来源。

## 会话身份与关系

目标会话记录至少包含：

```ts
{
  sessionId: string;
  workspaceIdentity: string;
  workspacePath: string;
  remoteSessionId?: string;
  createdBySessionId?: string;
  createdBy: "user" | "ai" | "automation";
  approvalPolicy: "manual" | "delegated" | "autonomous";
}
```

路由 key 统一使用 `workspaceIdentity?.trim() || workspacePath`。远程请求必须同时保留 `workspaceIdentity` 和 `remoteSessionId`，不得只按路径匹配。

## 审批策略

### `manual`

默认安全策略。所有需要审批的操作都交给用户 UI。创建者 AI 只能读取 `pendingPermissions` 并告知用户。

### `delegated`

允许创建者 AI 对目标会话的明确审批请求作出决定，但受以下约束：

- 只能作用于自己创建或被显式授权的目标会话。
- 必须指定精确的 `requestId`，不能按“最近请求”匹配。
- `allow_once`、`deny` 默认可用；`allow_always` 必须额外授权。
- workspace、远程连接和目标会话必须通过 Host 受信上下文校验。
- 每次决定都要记录审批者会话、目标会话、requestId、decision、reason、traceId。

### `autonomous`

目标会话使用 `yolo` 或等价的全自动权限策略，不产生用户审批等待。它是绕过审批，不是审批委托，适合明确授权的后台任务。

## 新增控制面

建议新增独立工具和 Port，不把审批逻辑塞进发送消息工具：

```ts
resolve_session_permission({
  sessionId: string;
  requestId: string;
  decision: "allow_once" | "allow_always" | "deny";
  reason?: string;
})
```

返回：

```ts
{
  requestId: string;
  status: "resolved" | "already_resolved";
  decision: "allow_once" | "allow_always" | "deny";
}
```

用户 UI 和创建者 AI 可能同时处理同一个请求。Host 必须以 `requestId` 做单次幂等决议：先到者成功，后到者返回 `already_resolved`，不得向 Agent 发送两次响应。

## 消息与执行关联

`SendSessionMessage` 应返回 admission，而不是空对象：

```ts
{
  messageId: string;
  turnId: string;
  acceptedAt: number;
  deduplicated: boolean;
}
```

- `messageId`：持久投递幂等键。
- `turnId`：本次目标会话执行实例。
- `traceId`：链路观测 ID。
- `queryId`：可选的上层请求分组。

同一 `messageId` 重试必须返回原 admission；同 key 不同内容返回冲突，不得创建第二个 turn。

## 状态与通知

Phase 1 保持：

```text
send -> accepted(messageId, turnId) -> read_session(afterSeq, turnId)
```

Phase 2 增加轻量 `session/changed` notification：

- 目标会话状态、审批或终态发生变化时发送。
- notification 只负责唤醒创建者 Agent，不承载完整快照。
- 创建者收到通知后调用 `ReadSession` 获取事实。
- 通知丢失时，`afterSeq` + snapshot 负责恢复。

## 模块归属

| 能力 | 目录 | 责任 |
|------|------|------|
| 工具 schema/handler | `apps/zcode-cli/packages/contracts/src/tools/`、`apps/zcode-cli/packages/core/src/tool/handlers/` | 参数校验、工具描述、调用 Port |
| Agent 侧端口 | `apps/zcode-cli/packages/contracts/src/interfaces/` | `ZCodeTaskPort`、`ZCodeSessionPort`、`ZCodePermissionPort` |
| 反向请求 broker | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/` | 序列化、请求上下文、取消和响应校验 |
| Host 协议分发 | `packages/services/src/zcode-agent/` | dispatch、目标会话定位、远程路由、审批响应转发 |
| 权限策略 | `apps/zcode-cli/packages/core/src/permission/` | manual/delegated/autonomous、风险和授权判断 |
| 会话事实与持久化 | `packages/services/src/zcode-session/`、`packages/services/src/session/`、`packages/shared/src/zcode-protocol/` | 关系、策略、projection、协议 schema |
| UI 展示与用户审批 | `packages/ui/src/` | 会话列表、审批面板、用户决议，不拥有审批事实 |

应新增独立文件承载审批扩展，例如：

```text
apps/zcode-cli/packages/contracts/src/interfaces/zcode-permission.port.ts
apps/zcode-cli/packages/bootstrap/src/zcode-protocol/zcode-permission-broker.ts
packages/services/src/zcode-agent/zcodePermissionCommandExecutor.ts
apps/zcode-cli/packages/core/src/permission/delegated-approval-policy.ts
```

不要继续向巨型 `zcodeAgentService.ts` 堆积所有审批业务；它只负责协议分发和生命周期协调。

## 分阶段实现

### Phase 1：平级会话

- 本地/远程创建普通持久会话。
- 用户可在 UI 直接介入。
- AI 可发送消息、读取状态和发现等待审批。
- 审批仍由用户处理；后台任务使用 `autonomous/yolo`。

### Phase 2：本地审批委托

- 新增 `ZCodePermissionPort` 和 `resolve_session_permission`。
- 加入 `manual/delegated/autonomous` 策略。
- 实现用户与 AI 的 `requestId` 幂等竞争。
- 增加审批审计事件和权限测试。

### Phase 3：远程审批与通知

- 远程 Host 转发审批请求和决议。
- 增加 `session/changed` notification。
- 断线后使用 `afterSeq`/snapshot 恢复。
- 增加远程授权失效、stale run、Host 重连测试。

## 验收场景

1. AI 在本地创建平级会话，用户从侧边栏打开并发送消息，目标会话继续运行。
2. AI 在远程 workspace 创建平级会话，远程 Host 创建 Agent runtime，本地仅做路由和展示。
3. `manual` 会话产生审批，用户批准后目标会话继续，创建者可读取结果。
4. `delegated` 会话产生审批，创建者 AI 使用精确 `requestId` 批准，目标会话继续。
5. 用户和 AI 同时审批同一请求，只有一个决议生效，另一方得到 `already_resolved`。
6. 消息响应丢失后，用相同 `messageId` 重试不产生第二个 turn。
7. 远程连接短暂断开，目标会话继续运行，重连后通过 snapshot/`afterSeq` 恢复。

## 安全结论

“用户可见的正常会话”和“AI 可代审批”可以同时成立，但审批委托必须是显式、可审计、按 requestId 串行决议的权限能力。不能通过 `yolo`、普通消息或创建关系隐式获得审批权限。
