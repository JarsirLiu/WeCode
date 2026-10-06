# Agent Note: AI WorkspaceList Uses the Host Index

Status: implemented

English: [English version](2026-10-06-ai-workspace-list-host-index.md)

## Problem

AI 的 `WorkspaceList` 原先从 `process.cwd()` 下的持久化 task 推导工作区，因而会漏掉远程工作区、没有 task 的工作区，并生成与 Host 路由不一致的合成身份。

## Root cause

该工具错误地依附在 `ZCodeTaskPort.listTasks()` 上，而 Host 已经通过设置服务持有工作区索引。handler 还推测了没有权威来源的项目类型和活跃状态字段。

## Decision

AI 工作区发现现在使用独立的 `WorkspaceIndexPort` 和 `workspace/list` 反向协议，由 Host executor 调用 `ISettingService.listWorkspaces()`。工具仅返回索引实际拥有的元数据；本地工作区缺少显式 identity 时，以路径作为身份键。工具注册门与 task/session 工具分离。MCP 继续保留自己的 ACL 和传输 handler，同时与 AI 共用 Host 设置索引作为数据来源。

## Fix

handler 不再调用 `process.cwd()` 或 `listTasks()`，也不再推测项目和活跃状态字段。现在由独立 broker 和 Host executor 校验并返回设置索引。

## Affected surfaces

改动涉及 AI 工具契约与 handler、core runtime port 传递和工具注册、shared 反向协议 schema、bootstrap broker，以及 Host service executor。AI 调用方 session 仍作为受信请求上下文，但不会被用作 Host 工作区索引的过滤条件。

## Alternatives considered

**继续聚合 `listTasks()`** 被拒绝，因为它无法表达无 task 工作区、远程工作区或 Host 持有的稳定身份。

**复用 MCP HTTP endpoint** 被拒绝，因为 AI runtime 不应依赖外部传输、MCP 开关或 MCP 授权上下文。

**把工作区列表加入 task/session executor** 被拒绝，因为工作区发现属于 Host 设置索引，不应扩大 task/session 服务契约。

## Consequences

工作区结果现在与 Host 设置索引一致，包含无 task 和远程条目，且不暴露远程目标凭据。由于权威索引不持有这些数据，结果不再包含 `projectType`、活跃时间或活动会话计数。若未来需要这些字段，必须提供明确的 Host 数据源和契约。

## Testing

无密钥回放覆盖 AI handler 对 port 的调用，以及 Host `workspace/list` 经设置索引的 relay，包含本地、远程和无 task 工作区。本次变更和测试均不启动桌面端。
