# Agent Note: MCP 服务开关与配置展示

Status: implemented

English | [中文](2026-10-06-mcp-server-enable-toggle.md)

## Problem

MCP 设置页虽然已有 `mcpEnabled` 设置字段和配置展示组件，但 MCP 专属入口没有传递变更回调，开关因此始终处于禁用状态，用户无法控制是否展示可复制配置。

## Decision

设置页复用现有 `AppSettings.mcpEnabled` 作为唯一状态所有者。缺失值按开启兼容旧用户；开关通过 `useSettings().update` 持久化。开启时渲染桌面主进程生成的配置，关闭时隐藏配置展示。

MCP 配置本身保持单例语义：server key 固定为 `wecode`，生成结果不带随机 ID/时间戳且不落盘。多个外部 Agent 中分别存在一份副本是各客户端的配置，不是 WeCode 生成了多份实例；路径变化时由用户用当前 JSON 覆盖外部客户端的同名条目。

## Affected surfaces

`packages/ui/src/SettingsPage.tsx`、`packages/ui/src/settings/PluginsSection.tsx`、`packages/ui/src/settings/McpSettingsSection.tsx` 和 MCP 功能规格。

## Alternatives considered

**在 MCP store 中新增一份开关状态。** 放弃，因为会产生第二个事实源并可能与全局设置不一致。

**在 UI 中硬编码配置并随开关切换。** 放弃，启动路径只能由桌面宿主运行时解析，UI 不应生成无效命令。

## Consequences

开关可操作且跨重启保持；关闭时不向用户展示配置。WeCode 不维护配置历史或多实例列表。已复制到外部客户端的旧配置不会被远程撤销，stdio 服务端实际调用授权仍属于后续运行时门禁范围。

## Follow-up Boundary

本 Note 不把“设置页开关”描述为完整 MCP 服务开关。发布提案现在明确：真正发布前必须让独立 stdio 适配器连接/按需拉起本地 Host，删除 stub tool handler，使用独立 launcher/Node runtime，并在 Host 运行时拒绝关闭后的新连接与调用。开发态 Electron 仅作为兼容启动器验证手段，不能进入正式外部 Agent 配置。
