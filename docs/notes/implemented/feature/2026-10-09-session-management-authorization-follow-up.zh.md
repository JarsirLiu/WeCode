# Agent Note: 会话管理授权与权限审批策略后续提案

## Status

proposed

## Problem

会话关系中的 `approvalPolicy` 描述目标会话遇到权限请求时的处理方式，不应同时决定创建者能否读取、发消息、停止生成或修改模型。当前两类授权混用会导致 `manual` 在首条消息阶段被 Host 拒绝，而请求尚未进入目标 runtime，也不会产生可审批的 pending permission。

## Proposed boundary

- 会话管理授权：由 Host 根据 caller、target、关系来源和操作类型判断；不能仅凭全局唯一 session ID 放行。
- 权限审批策略：只在目标 runtime 产生精确 `requestId` 后生效；`manual` 由用户 UI 处理，`delegated` 才允许受授权的 AI 调用 `ResolveSessionPermission`。
- `yolo` 创建路径作为当前 AI 工具默认行为，不把审批策略参数暴露给模型。

## Next design work

补充 caller/target/creator 的关系矩阵，明确普通管理操作、权限决策、跨 workspace 路由和撤销语义，并增加无密钥 Host 回放测试。完成设计审查后再修改 `resolveManagedTarget` 与 `resolveSessionPermission` 的实现。
