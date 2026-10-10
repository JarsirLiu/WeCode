# Agent Note：ReadSession 暴露会话管理状态

Status: implemented

[English](2026-10-10-read-session-status-summary.md)

## 问题

Host 的会话快照已经包含当前模型、推理档位、运行模式、上下文统计和待处理权限请求 ID，但 AI 侧 `ReadSession` 投影丢弃了设置，并把权限请求压缩成数量，编排 AI 无法判断何时换模型、压缩上下文或处理具体请求。

## 决策

- 保留 `ReadSession` 作为 AI 唯一的读取和状态检查入口。
- 输出当前模型、推理档位、运行模式和有边界的待处理权限摘要。
- 继续在同一摘要中返回上下文统计，并保留现有最近消息和工具调用限制。
- 不暴露 `approvalPolicy`；权限行为由与桌面端一致的会话运行模式决定。
- 不向 AI 暴露完整模型目录、权限请求 input/options 或工具 input/output。

## 备选方案

**新增 `GetSessionStatus` 工具：**拒绝，因为它会对同一 authoritative 快照建立第二条读取链路，并让模型为一次状态判断调用两个工具。

**暴露完整会话快照：**拒绝，因为其中包含 UI 专用设置、工具 payload 和模型目录，数据量大且不属于编排决策所需信息。

## 后果

`ReadSession` 调用方现在可以选择已知模型、根据上下文压力压缩，并处理精确的待审批请求。Host 仍是会话状态和冷恢复的唯一所有者，工具只接收有边界的投影。

## 受影响的表面

- AI 会话编排契约和 `ReadSession` 摘要投影。
- Core 工具 wiring 回放测试。
- AI 会话编排特性 spec。
