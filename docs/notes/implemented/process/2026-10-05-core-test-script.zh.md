# Agent Note: 给 @zcode/core 接上测试脚本

Status: implemented

[English](2026-10-05-core-test-script.md)

## Problem

`@zcode/core` 包有三个测试文件（`compact-prompt.test.ts`、`tool-port-wiring.test.ts`、`workspace-list-sessions.test.ts`），都用 Node 内置测试运行器——`import test from "node:test"` 和 `import assert from "node:assert/strict"`——但 `package.json` 里没有 `test` 脚本。这些测试只被 `tsc` 类型检查，从不在开发或 CI 中执行。这不只 core 一家：整个仓库在八个包里散落 23 个 `*.test.ts` 文件，而 `test` 脚本一个都没有。`verify:pre-push` 跑 lint + 行数棘轮 + 架构检查，就是不跑测试。

代价很具体：commit `466ec43` 拆分 `call-runner.ts` 后带着 17 个类型错误提交，直接让 `pnpm build` 挂掉；而 `tool-port-wiring.test.ts`——恰好验证了被拆分破坏的那条 executor 接线——就躺在 `core/test/` 里，却没法报警。本该抓住回归的测试已经写好了，只是没接上。

## Decision

给 `@zcode/core` 的 `package.json` 加 `test` 脚本：

```
"test": "node --test --import tsx \"test/**/*.test.ts\""
```

用 Node 24 内置测试运行器（`node --test`，现有测试文件本来就这么写），加 `tsx`（已是根 devDependency）做 TypeScript loader。glob 加引号让 Node 自己解析，跨平台一致（cmd.exe、PowerShell、bash 行为相同）。

## Workflow change

- **新命令**：`pnpm --filter @zcode/core test` 跑 `core/test/` 下全部 15 个测试（约 4 秒）。包目录内直接 `pnpm test`。
- **无新依赖**：`tsx` 从根 devDependency 提升（hoisted）；`node:test` 和 `node:assert/strict` 是 Node 内置。包的 `devDependencies` 未变。
- **测试发现**：`test/**/*.test.ts` 匹配现有测试文件。`core/test/` 下新增的测试自动被捡到。
- **CI**：尚未接入。仓库没有测试 workflow（只有 `release-desktop.yml`）；把 `pnpm -r test` 加进 CI 是单独的后续流程变更。
- **`verify:pre-push`**：尚未扩展。加 `&& pnpm -r test` 会让 pre-push 门禁跑测试，但前提是每个包都有 `test` 脚本——否则没脚本的包会报错。暂缓。

同样的模式适用于其他七个有测试文件却没脚本的包（`packages/services`、`packages/ui`、`packages/desktop`、`packages/provider`、`apps/zcode-cli/packages/adapters`、`apps/zcode-cli/packages/bootstrap`，以及 `packages/formal-proof` 如果以后长出测试）。铺开是机械活，列为后续。

## Alternatives considered

**为什么用 `node --test` 而不是 vitest 或 jest？** —— 现有 23 个测试文件都 `import test from "node:test"` 和 `import assert from "node:assert/strict"`。vitest 和 jest 要么靠 shim 重复一遍这套 API，要么重写每个测试文件。`node --test` 直接跑，零新依赖、零配置文件。Node 24 的运行器稳定，对当前测试形态（同步与异步 `test()`、`assert`）足够。

**为什么 `node --test --import tsx` 而不是 `tsx --test`？** —— `tsx` 有自己的 `--test` 包装，但 `node --test --import tsx` 明确表示 Node 内置运行器是权威、`tsx` 只是 loader。这与测试文件的写法（`import test from "node:test"`）意图一致，也保留了将来去掉 `tsx`、改跑编译后 `.js` 测试产物的可能。

**为什么给 glob 加引号？** —— 不加引号，开了 `globstar` 的 bash 会自己展开 `**`，把文件路径传给 Node；没开 `globstar` 的 bash、cmd.exe、PowerShell 会把字面 pattern 传过去。加引号让 Node 在每种 shell 里都自己处理 glob，脚本在各平台行为一致。

## Consequences

**正面**：

- 15 个测试现在能跑了，包括 `tool-port-wiring.test.ts`——它走完整 executor 链路（deps → call-runner context → handler），本来会在下一次 `pnpm test` 时抓住 `466ec43` 的拆分破坏，而不是等到 `pnpm build` 才暴露。
- 无新依赖、无配置文件、无需重写现有测试。
- 确立了仓库其余部分可复制的约定：`node --test --import tsx "test/**/*.test.ts"`。

**负面**：

- 测试经 `tsx` 跑源码，不是跑 build 出来的 `dist/`。可能出现测试通过但 build 挂了的情况（比如某非测试文件的 `tsc` 类型错误）。缓解：`pnpm build`（tsc）仍是类型门禁，`pnpm test` 是行为门禁，两者互补而非互替。
- 只接了 `@zcode/core`。其余七个有测试文件的包还是没法跑，除非加同样的脚本。比如 `packages/services` 的回归仍会从根 `pnpm test` 漏过。
- 还没进 CI 或 `verify:pre-push`，所以跳过本地 `pnpm test` 的开发者仍能推一个挂掉的测试。

## Related

- 记录未被接上的测试本应抓住的破坏的 bug-fix Note：[executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
- 现在可执行的测试文件：[core/test/](../../../../apps/zcode-cli/packages/core/test/)
- 根 `tsx` 依赖：[package.json](../../../../package.json)
