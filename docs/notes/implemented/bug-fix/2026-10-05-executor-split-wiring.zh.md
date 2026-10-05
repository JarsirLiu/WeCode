# Agent Note: 修复 LoadToolSet executor 拆分后 core 不再编译的问题

Status: implemented

[English](2026-10-05-executor-split-wiring.md)

## Problem

Commit `466ec43`（"feat: implement LoadToolSet tool for dynamic builtin tool loading"）把 `call-runner.ts` 拆成四个文件并新增了 `LoadToolSet` handler，但结果从未通过编译：`load-tool-set.ts`、`tool-set-loader-port.ts`、`call-runner.ts`、`execution-context-builder.ts`、`tool-result-handler.ts` 共 17 个类型错误。从该 commit 起，`@zcode/core` 包的 `pnpm build`（tsc）在本分支一直失败。这个破损被当作"既有技术债"往后传，而不是被识别为该特性工作引入的编译回归。

## Decision

修好拆分时丢掉的接线，让 `pnpm build` 恢复绿色。无行为变更——每处修复都是恢复拆分前 `call-runner.ts` 的语义。三组：A（导入路径）、B（ToolEntry 形状）、C（executor 拆分接线）。

## Root cause

三种失败模式，都是"拆分重构忘了接线"：

1. **导入路径写错。** `load-tool-set.ts` 从不存在的 `../../error/index.js` 导入 `createCoreError`/`CoreErrorType`（包里是 `errors/` 复数；符号实际在 `@zcode/contracts`）。`tool-set-loader-port.ts` 从 `../../../tool/types.js` 导入 `ToolEntry`——对 `src/runtime/helpers/` → `src/tool/types.ts` 多了一层 `../`。

2. **ToolEntry 对着一个不存在的 API 声明。** `loadToolSetToolEntry` 用了 `ToolEntry extends ToolContractDeclaration` 上不存在的字段：`capability` 写成对象（实际 `string`）、`execute` 而非 `handler`、`executionMode: "normal"`（合法值 `"client" | "providerNative"`）、`sideEffectScope: "runtime_state"`（合法值 `"none" | "workspace" | "git" | "network" | "system" | "session" | "userInteraction"`）、`inputSchema` 用 Zod 对象（实际 `JsonSchema`）。必需的 `permission`/`resultBudget`/`timeout`/`cancellation`/`trace` 块整段缺失。兄弟 `readSessionToolEntry` 已有正确形状可参照。

3. **executor 拆分丢了类型接线。** 把 `resolveModelOutputEntry` 提取到 `model-output-entry.ts` 后，原声明仍留在 `call-runner.ts`（import 与本地声明冲突）。新文件 `execution-context-builder.ts` 把 `traceId`/`turnId` 标成普通 `string` 而非 branded `TraceId`/`TurnId`，从 `../types.js` 导入 `SessionEvent`（`types.ts` 只 import 不 re-export），从 `deps` 读 `subagentModelOverride`（该字段在 `ToolExecuteOptions` 上，不在 `ToolExecutorDeps`）。三处调用把 `number | undefined` / `boolean | undefined` 传进要求非空参数的位置。

## Fix

| 组 | 文件 | 修复 |
|----|------|------|
| A | `tool-set-loader-port.ts` | 导入路径 `../../../tool/types.js` → `../../tool/types.js` |
| A | `load-tool-set.ts` | `createCoreError`/`CoreErrorType` 改从 `@zcode/contracts` 导入（参照 `read-session.ts`）；删未用的 `getToolEntry` 导入 |
| B | `load-tool-set.ts` | 照 `readSessionToolEntry` 重写 `loadToolSetToolEntry`：`capability: string`、`handler`、`inputSchema`/`outputSchema` 用 JsonSchema、`runtimeInputSchema`/`runtimeOutputSchema` 用 Zod、`executionMode: "client"`、`sideEffectScope: "session"`，补齐 `permission`/`resultBudget`/`timeout`/`cancellation`/`trace` 块 |
| C | `call-runner.ts` | 删残留的本地 `resolveModelOutputEntry`（提取版在 `model-output-entry.ts` 已导入） |
| C | `execution-context-builder.ts` | `SessionEvent` 从 `@zcode/contracts` 导入；`traceId: TraceId`、`turnId: TurnId`；`subagentModelOverride` 加进 `ExecutionContextBuilderInput`、解构、从 input 读（不再从 `deps`） |
| C | `call-runner.ts` | 调用处传 `subagentModelOverride: options?.subagentModelOverride` 给 `buildExecutionContext` |
| C | `tool-result-handler.ts` | `turnId?: TurnId` |
| C | `call-runner.ts` | 兜底 `permissionWaitMs ?? 0`、`serialization?.returnedBytes ?? 0`、`serialization?.truncated ?? false` |

**验证**：`pnpm build`（core，tsc）——17 错误 → 0。`pnpm typecheck`（根）——通过。`pnpm lint`——0 errors（14 条预存 warning，无一条在改动文件）。`pnpm fmt:check`——通过。`pnpm architecture:check --changed`——0 violations。`pnpm size:check`——3 项失败，全在 `packages/ui/src/v4/`，与改动文件无关。未跑运行时测试：`@zcode/core` 包没有 test 脚本，`tsc` 是唯一门禁（它也类型检查测试文件）。

## Alternatives considered

**为什么不直接回退 `466ec43`？** —— 拆分结构上是合理的：把上下文构建、结果处理、模型输出解析从 call runner 分离，并交付 LoadToolSet 特性。回退会丢掉一次合理的清理。修接线能两者都保。

**为什么在调用处兜底 `permissionWaitMs`/`returnedBytes`/`truncated`，而不是放宽被调方签名接受 `undefined`？** —— 在源头（读 `permissionResult.permissionWaitMs`、解引用 `serialization?.` 处）兜底，被调方契约保持严格，"undefined 即 0/false"的默认在消费点显式可见。放宽被调方会把空值处理推给每个未来调用者。

**为什么把 `subagentModelOverride` 经 `ExecutionContextBuilderInput` 传，而不是加到 `ToolExecutorDeps`？** —— override 是 per-call 的（在 `ToolExecuteOptions` 上，随每次 `execute()` 调用变化）；`ToolExecutorDeps` 是 executor 的稳定接线。把 per-call 字段放到 `deps` 上会暗示它是 executor 级的，这是错的。

## Consequences

**正面**：
- `@zcode/core` 自 `466ec43` 以来首次编译通过；LoadToolSet 特性与 executor 拆分终于可用，不再是落地即死。
- `loadToolSetToolEntry` 与 `readSessionToolEntry` 同形，meta-tool 也走同一套 permission/budget/timeout/trace 门禁。
- 拆分文件里 branded 类型纪律（`TraceId`/`TurnId`）恢复，与拆分前的单文件代码一致。

**负面**：
- 改动触及跑每个工具调用的 executor 管道，潜在回归会影响所有工具。缓解：每处修复都恢复拆分前语义，回归面是"接线是否还原正确"，而非"行为是否变了"。
- `LoadToolSet` 运行时集成（实际通过 `toolSetLoaderPort` 注册工具）仍未实现；本次修复只让 handler 编译通过并注册其 `ToolEntry`。特性 Note 里的 deferred 项仍然成立。

## Related

- 特性 Note：[builtin-tool-dynamic-loading.md](../feature/2026-10-04-builtin-tool-dynamic-loading.md)
- 兄弟 handler 参照：[read-session.ts](../../../../apps/zcode-cli/packages/core/src/tool/handlers/read-session.ts)
- ToolEntry 契约：[contract.ts](../../../../apps/zcode-cli/packages/contracts/src/tools/contract.ts)
