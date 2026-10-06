# Agent Note: MCP Host Control Contract v1

Status: implemented

English | [English](2026-10-06-mcp-host-control-v1.md)

## Problem

MCP 适配器之前只能连接已经运行的 Host。外部 Agent 无法恢复停止的 Host，也无法稳定区分 Host 不可用、launcher 启动失败和启动超时。

## Decision

在 server CLI runtime 增加版本化 `connect-or-start` 控制边界。适配器复用 ready Host、等待 starting Host，或通过稳定 launcher 执行 `serve --daemon`；随后轮询持久化状态快照并返回 v1 契约和稳定错误码。状态损坏或不可读时 fail-closed。

## Affected surfaces

改动覆盖 `packages/zcode-server-cli` 的 MCP Host 启动、CLI contract/status snapshot、MCP 特性 spec 和无密钥生命周期测试。不在开发过程中启动 Desktop/Electron，也不会因 MCP 进程退出而停止共享 Host。

## Alternatives considered

**直接启动 Electron：** 放弃，因为正式 MCP 路径必须使用独立 launcher。

**只复用 WebSocket：** 放弃，因为它无法恢复离线 Host，也不能区分生命周期失败。

## Consequences

首次 MCP 连接可能启动已安装的本地 Host，并等待最多 15 秒。Host 重启后已有连接失效，外部 Agent 必须重连。开发环境可调用当前 CLI 入口，发布安装必须提供稳定 launcher。

## Verification

`mcpHostControl.test.ts` 在无凭据且不启动 Desktop 的条件下验证离线启动和复用 ready Host。
