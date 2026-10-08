# Agent Note: ListSessions 分阶段工具 UI

Status: implemented

English | [中文](2026-10-08-session-orchestration-list-sessions-ui.md)

## Problem

`ListSessions` 会返回查询参数和结构化会话列表，但工具卡在运行时隐藏了查询目标和生效选项。

## Decision

现有会话编排工具行在运行态和终态投影 `ListSessions`。折叠摘要标识目标工作区；展开输入显示身份、可选路径、是否包含归档项和数量上限，并显示 schema 默认值 `false` 与 `50`。完成结果仍仅显示白名单会话数量以及每条会话的标题、ID 和状态。

## Affected surfaces

- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration-list-sessions.ts`
- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration.tsx`
- `packages/ui/src/i18n/locales/en-US.ts`
- `packages/ui/src/i18n/locales/zh-CN.ts`
- `packages/ui/test/sessionOrchestrationToolUi.test.ts`
- `docs/specs/features/ai-session-orchestration.md`

## Alternatives considered

- 不把查询参数留在原始工具 JSON 中，因为运行中的卡片将无法说明正在查询哪个工作区和范围。
- 不渲染完整输入或输出对象，因为其中包含稳定工具契约之外的实现细节。

## Consequences

Host 查询完成前，调用者即可看到目标工作区和生效的查询选项。UI 仍投影原有工具调用行，不增加 transcript 项。
