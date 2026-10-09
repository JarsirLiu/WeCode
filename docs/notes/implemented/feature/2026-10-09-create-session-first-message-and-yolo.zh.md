# Agent Note: 创建会话必须发送首条消息并默认使用 yolo

Status: implemented

English：[English version](2026-10-09-create-session-first-message-and-yolo.md)

## 问题

允许 AI 创建空会话会留下无法执行请求的会话。可选的历史 `initialPrompt` 也让编排契约与预期流程不一致；同时暴露 `manual` 容易把目标权限审批和会话管理授权混淆。

## 决策

- `CreateSession.content` 必填，创建成功后沿同一 Host task service 立即调用 `sendPrompt`。
- 未指定模式时使用 `yolo`。
- AI 与 MCP 的公开创建契约移除 `initialPrompt` 和 `approvalPolicy`；MCP 使用必填 `message`。
- 首条消息发送失败时工具失败，但保留已创建会话给用户继续处理。
- 会话管理授权和目标会话权限审批作为独立问题提案，本次不改变 Host 授权模型。

## 后果

现有调用方必须提供 `content` 或 `message`。UI 只展示首条 `content`，不再显示历史 `approvalPolicy` 字段。

## 影响面

同步更新应用内 AI 与 MCP 的 CreateSession schema、Host handler、会话工具 UI 投影、特性 spec 和协议回放测试。

## 替代方案

- 保留首条消息可选：会继续产生空会话，并需要第二次工具调用才能开始任务。
- 在 CreateSession 暴露 approvalPolicy：会把目标权限处理方式与会话管理授权耦合。
- 首条消息失败时删除会话：会引入额外生命周期和回滚路径；当前保留会话供用户处理。
