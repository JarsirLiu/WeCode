# Agent Note：MCP 仅 HTTP 清理与 Host 工作区 ACL

状态：已实现

English: [English version](2026-10-06-mcp-http-only-cleanup.md)

## 问题

产品契约已经切换为仅 HTTP，但仓库仍暴露 `mcp stdio` CLI 命令和 MCP stdio SDK 导出；Host bridge 在会话/任务操作前也缺少明确的工作区边界校验。

## 决策

移除 MCP 专用 stdio API 和 CLI 入口，但保留 Desktop/Host 内部 RPC 使用的普通 stdio。所有带工作区的 MCP 操作都通过 Host 持有的 `listWorkspaces()` 索引校验，优先使用 `workspaceIdentity`，本地场景回退到 `workspacePath`。新增无凭据协议回放和 bridge 测试。

## 影响面

改动覆盖 `packages/server` MCP 协议导出与测试、`packages/zcode-server-cli` 命令面、Host tool adapter、MCP 特性规范和 Agent Note；普通内部 RPC stdio 不变。

## 结果

外部客户端只使用稳定的 Streamable HTTP endpoint。目标工作区不在当前 Host 索引中时返回 `WECODE_MCP_WORKSPACE_FORBIDDEN`。

## 备选方案

保留隐藏的 stdio 兼容入口会形成第二套传输契约，并重新引入 HTTP-only 提案拒绝的 launcher/安装产物歧义，因此不采用。
