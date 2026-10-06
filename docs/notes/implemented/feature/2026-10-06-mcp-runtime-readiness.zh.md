# Agent Note: MCP runtime readiness

Status: implemented

English: [English version](2026-10-06-mcp-runtime-readiness.md)

## Problem

设置页此前只要应用运行就展示固定 MCP URL，即使 server-core 尚未启动或端口被占用，用户会得到看似正确但无法连接的配置。

## Decision

桌面 Host 和 server-core 共同提供固定 `39173` loopback listener。主进程配置解析器在返回唯一 HTTP 配置前探测 `HEAD /mcp`。endpoint 返回就绪状态并遵守 MCP 开关；探测不会创建 MCP session。

## Affected surfaces

MCP HTTP handler、桌面 Host listener、桌面主进程配置解析器和设置页可用性状态受到影响。正式协议仍使用 `POST /mcp`。

## Alternatives considered

- 读取 supervisor 状态文件会让 Desktop 绑定 CLI runtime 目录布局，并可能读到过期状态。
- 增加第二个健康检查 endpoint 会扩大网络表面并引入额外路径契约。

## Consequences

Host 启动中或端口冲突时，设置页可能显示不可用；Host ready 后需要重新打开设置页重试。外部客户端继续只使用 `POST /mcp`，不受探测请求影响。

## 后续修复

桌面主进程通过 `@zcode/server/mcp` 公开入口导入固定端口；该入口现在从 HTTP adapter 重新导出 `DEFAULT_MCP_HTTP_PORT`。此前缺少此导出会导致 tsup 仅构建成功 host/preload，main 构建失败，`dev:desktop` 因等待 `.main-build-ready` 而持续等待。
