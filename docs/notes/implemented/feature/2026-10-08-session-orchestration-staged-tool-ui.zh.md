# Agent Note: WorkspaceList 分阶段工具 UI

Status: implemented

English | [中文](2026-10-08-session-orchestration-staged-tool-ui.md)

## Problem

`WorkspaceList` 已返回结构化工作区索引，但专属工具卡没有渲染列表内容；Host 请求仍复用同一条运行中工具行时，也缺少清晰的完成态投影。

## Decision

沿用现有会话编排 renderer 的单工具行，在 `running`、`success`、`error` 状态间投影 `WorkspaceList`。运行中显示工具动作；完成后显示工作区数量，以及每个工作区的白名单摘要（标签、路径、身份、类型和可选用途或连接状态）。非法 JSON 继续使用现有纯文本回退，失败调用继续显示 Host 错误。

## Affected surfaces

- `packages/ui/src/ToolCallBlocks/renderers/session-orchestration.tsx`
- `packages/ui/test/sessionOrchestrationToolUi.test.ts`
- `docs/specs/features/ai-session-orchestration.md`

## Alternatives considered

- 不新增独立结果工具行，因为调用和结果已经共享 `ToolLayout` 生命周期，拆行会重复 transcript 状态。
- 不渲染完整 Host JSON，因为其中包含不稳定字段且不利于扫描。

## Consequences

工作区发现现在以与其他同步工具一致的分阶段卡片呈现。`SendSessionMessage` 和 `CreateSession` 的准入与创建语义保持不变，本次不涉及。
