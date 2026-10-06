# Agent Note: MCP 仅 HTTP 产品提案

Status: implemented

English | [English](2026-10-06-mcp-http-only-proposal.md)

## Problem

旧提案把本地 stdio 和独立 launcher 当作发布路径。这要求用户机器存在可执行命令，并可能增加额外运行时产物，与“不增加桌面端/CLI 体积、不新增 MCP 安装包”的要求冲突。

## Decision

产品提案现在只支持 MCP Streamable HTTP。桌面端 endpoint 复用现有运行中的 Host，默认只监听 loopback；云端 Gateway 复用现有后端/Host 支持远程 workspace。外部 Agent 通过 URL 连接，不启动 WeCode、Electron、Node 或独立 MCP 包。stdio 明确不属于产品支持范围。

## Affected surfaces

改动覆盖 MCP 特性 spec、配置 JSON 形态、传输架构、鉴权/workspace 授权要求、生命周期语义和发布验收测试。现有 stdio 实现文件在 HTTP endpoint 完成前保留为迁移代码，之后在独立代码变更中移除或退役。

## Alternatives considered

**保留 stdio 为主传输：** 放弃，因为要求用户机器存在可执行命令。

**发布独立 CLI/运行时：** 放弃，因为会增加发布产物和安装包体积。

**同时支持两种传输：** 首个产品契约暂不采用，因为会重复鉴权、生命周期和验收面。

## Consequences

设置页将展示一份稳定的 HTTP 配置，包含 URL 和短期凭据机制。本地 workspace 访问要求桌面 Host 已运行；远程 workspace 访问要求云端 Gateway 和 ACL。MCP adapter 不能在 HTTP 请求中启动第二套业务运行时。

## Verification

修订后的 spec 要求无安装包、无 Electron 子进程、无源码路径、无明文密钥的 HTTP MCP harness。
