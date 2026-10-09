# Agent Note: 会话管理授权与权限审批策略后续提案

Status: proposed

## Problem

会话关系中的 `approvalPolicy` 描述目标会话遇到权限请求时的处理方式，不应同时决定创建者能否读取、发消息、停止生成或修改模型。当前两类授权混用会导致 `manual` 在首条消息阶段被 Host 拒绝，而请求尚未进入目标 runtime，也不会产生可审批的 pending permission。

## Proposal

- 会话管理授权：由 Host 根据 caller、target、关系来源和操作类型判断；不能仅凭全局唯一 session ID 放行。
- 权限审批策略：只在目标 runtime 产生精确 `requestId` 后生效；`manual` 由用户 UI 处理，`delegated` 才允许受授权的 AI 调用 `ResolveSessionPermission`。
- `yolo` 创建路径作为当前 AI 工具默认行为，不把审批策略参数暴露给模型。

## 影响面

Host task/session 授权、关系持久化、AI 会话管理工具、MCP 会话管理工具、跨工作区路由和 Host 回放测试。

## Acceptance criteria

明确 caller、target、creator 对普通会话管理与权限决策的关系；规定跨 workspace 路由和撤销行为；在修改授权代码前，以无密钥 Host 回放测试覆盖 manual/delegated 的审批行为。

## Risks

关系矩阵不完整可能导致创建者的普通操作被阻止，或仅凭 session ID 就授权。Host 仍是授权事实源，broker 提供的 workspace 字段不能作为授权依据。

## 替代方案

**用 `approvalPolicy` 作为管理 ACL：** 放弃，因为权限提示策略不能表达哪个调用方可以管理会话。

**仅凭 session ID 授权：** 放弃，因为标识符用于定位，不代表授权。
