# Agent Note: MCP main-build export regression

Status: implemented

English: [English version](2026-10-06-mcp-main-build-export-regression.md)

## Problem

桌面主进程通过 `@zcode/server/mcp` 导入固定 MCP 端口，但公开入口没有重新导出该常量。结果是 host 和 preload 仍能构建，main 构建失败，`dev:desktop` 一直等待 `.main-build-ready`。

## Decision

server MCP 公开入口重新导出 `DEFAULT_MCP_HTTP_PORT`，并由 server MCP 测试断言公开契约和固定值。桌面 tsup 继续作为进程级启动 smoke check。

## Affected surfaces

受影响的是 `packages/server` MCP 公开入口、桌面 main 构建和 MCP server 测试套件。运行时行为与 HTTP wire 格式没有变化。

## Alternatives considered

**桌面端直接导入 HTTP 模块：** 放弃，因为这会绕过包的公开入口，削弱跨包契约。

**只依赖手动启动桌面端：** 放弃，因为公开导出缺失可以在 CI 中确定性地提前发现。

## Consequences

现在由无密钥测试覆盖公开导出契约。单测通过不能替代桌面 tsup smoke build；后者仍用于验证所有 Electron 入口能一起打包。
