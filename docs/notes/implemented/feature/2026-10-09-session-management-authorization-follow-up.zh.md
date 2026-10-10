# Agent Note: 会话管理授权与权限审批策略后续提案

Status: implemented

English：[English version](2026-10-09-session-management-authorization-follow-up.md)

## Problem

会话关系中的 `approvalPolicy` 描述目标会话遇到权限请求时的处理方式，不应同时决定创建者能否读取、发消息、停止生成或修改模型。当前两类授权混用会导致 `manual` 在首条消息阶段被 Host 拒绝，而请求尚未进入目标 runtime，也不会产生可审批的 pending permission。

## 决策

- 会话管理授权：由 Host 根据 caller、target、关系来源和操作类型判断；不能仅凭全局唯一 session ID 放行。
- 用户可见的权限模式只有桌面端同一套 `mode`：`yolo` 不产生普通审批，其他模式使用目标 runtime 的 pending permission 流程。
- 创建者 AI 与用户一样拥有自己创建目标会话的完整管理和权限决议能力；Host 校验创建关系、精确 pending `requestId` 和 workspace 路由后允许 AI 决议。
- `approvalPolicy` 从活动协议和关系模型移除。旧 SQLite 列只为迁移兼容保留，不再参与行为。
- 权限审计继续记录 `resolverKind` 和 `resolverSessionId`，未来可区分 AI 与用户制定策略。

## 影响面

Host task/session 授权、关系持久化、AI 会话管理工具、MCP 会话管理工具、跨工作区路由和 Host 回放测试。

## 后果

- AI 和用户共享一套可见模式与目标 runtime 权限流程。
- 创建者 AI 可以处理自己目标会话的精确待审批请求，无关系调用者仍被拒绝。
- 旧数据库保留废弃列，后续可在破坏性迁移中删除；运行时不再依赖该列。

## 测试

无密钥回放应覆盖创建者 AI 审批、精确 pending request、无关调用方拒绝，以及审计中的 resolver 身份。

## 替代方案

**用 `approvalPolicy` 作为管理 ACL：** 放弃，因为权限提示策略不能表达哪个调用方可以管理会话。

**仅凭 session ID 授权：** 放弃，因为标识符用于定位，不代表授权。
