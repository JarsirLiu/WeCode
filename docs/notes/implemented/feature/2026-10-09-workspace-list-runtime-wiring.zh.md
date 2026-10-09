# Agent Note: WorkspaceList Runtime 装配

Status: implemented

English：[English](2026-10-09-workspace-list-runtime-wiring.md)

## Problem

Host 工作区索引和 `WorkspaceList` handler 已经存在，但 Protocol App 创建路径没有一致提供 workspace index 端口，导致会话可以创建和查询，却无法发现已登记工作区。第一轮装配修复停在 `createZCodeApp`：它把 task、session、permission 端口传给 `AgentRuntime`，却漏掉 `workspaceIndexPort`，因此工具能注册到模型 schema，执行时仍然失败。临时文本生成 Runtime 也没有明确的会话编排能力边界。

## Decision

Protocol App helper 是完整 Session Runtime 的唯一装配边界。会话创建和恢复统一开启四个 broker：task、session、permission、workspace index。调用方显式传入的端口保持优先。模型连通性测试和文本生成等临时 App 不开启这组能力，也不暴露会话编排工具。

`WorkspaceList` 继续只通过 Host 反向协议读取 `ISettingService.listWorkspaces()`，不扫描磁盘，也不根据当前工作目录推断工作区。

## Affected surfaces

Protocol App 装配、Core Runtime 工具注册、Host 工作区索引反向协议、会话创建与恢复，以及临时模型生成 Runtime。

## Alternatives considered

保留各调用点分别注入端口会导致 legacy、V4 和恢复路径逐渐分叉，因此不采用。增加文件系统扫描兜底会伪造 Host 登记列表，因此不采用。

## Consequences

Runtime 能力边界明确且一致，App 到 AgentRuntime 的转发边界也属于这份能力契约。Host 索引服务缺失仍返回可识别的结构化失败。测试需要分别覆盖开启会话编排的 Runtime 和关闭该能力的临时 Runtime。

