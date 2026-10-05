# Agent Note: 给所有包接上测试脚本

Status: implemented

[English](2026-10-05-core-test-script.md)

## Problem

仓库在七个包里有 24 个 `*.test.ts` 文件，全部用 Node 内置测试运行器——`import test from "node:test"` 和 `import assert from "node:assert/strict"`——但所有 `package.json` 里一个 `test` 脚本都没有。这些测试只被 `tsc` 类型检查，从不在开发或 CI 中执行。`verify:pre-push` 跑 lint + 行数棘轮 + 架构检查，就是不跑测试。

代价很具体：commit `466ec43` 拆分 `call-runner.ts` 后带着 17 个类型错误提交，直接让 `pnpm build` 挂掉；而 `tool-port-wiring.test.ts`——恰好验证了被拆分破坏的那条 executor 接线——就躺在 `core/test/` 里，却没法报警。本该抓住回归的测试已经写好了，只是没接上。

## Decision

给每个有测试文件的包加 `test` 脚本，统一用这个模式：

```
"test": "node --test --import tsx \"test/**/*.test.ts\""
```

用 Node 24 内置测试运行器（`node --test`，现有测试文件本来就这么写），加 `tsx`（已是根 devDependency）做 TypeScript loader。glob 加引号让 Node 自己解析，跨平台一致（cmd.exe、PowerShell、bash 行为相同）。

七个包现在都有脚本：`@zcode/core`（15 个测试）、`@zcode/services`（43）、`@zcode/ui`（14）、`@zcode/desktop`（10）、`@zcode/adapters`（7）、`@zcode/provider`（3）、`@zcode/bootstrap`（2）——共 94 个测试，`pnpm -r test` 全绿。

`@zcode/ui` 额外做了两件事：

**静态资源 loader**：UI 组件传递引用 `.svg`/`.png`/`.css` 资源（如 provider icons），`tsx` 无法加载。用 `module.register()` API 注册自定义 loader（`test/register-asset-loader.mjs` + `test/asset-loader-hooks.mjs`），把这些导入 stub 为空导出。UI 测试脚本为 `node --test --import tsx --import ./test/register-asset-loader.mjs "test/**/*.test.ts"`。

**Vitest 转换**：两个 UI 测试文件（`sessionBotWorkItem.test.ts`、`sessionOrchestrationToolUi.test.ts`）从 `vitest` 导入，但 `vitest` 在仓库里没装。转换为 `node:test` + `node:assert/strict`：`describe` 块展平为 `test()` 调用，`expect(x).toBe(y)` → `assert.equal(x, y)`，`expect(x).toBeNull()` → `assert.equal(x, null)`，`expect(x).not.toBeNull()` → `assert.notEqual(x, null)`。转换时暴露了一个潜在测试数据 bug：`row()` helper 缺 `inputText`，导致 `resolveToolInputPreview` 在 `undefined.length` 崩溃；加 `inputText: ""` 修复。

## Workflow change

- **新命令**：`pnpm -r test` 跑七个包的全部 94 个测试（约 50 秒）。单个包：`pnpm --filter @zcode/<name> test`。
- **无新依赖**：`tsx` 从根 devDependency 提升（hoisted）；`node:test` 和 `node:assert/strict` 是 Node 内置。无包的 `devDependencies` 变更。
- **测试发现**：`test/**/*.test.ts` 匹配现有测试文件。任何包的 `test/` 下新增测试自动被捡到。
- **UI 资源 loader**：`@zcode/ui` 额外需要 `--import ./test/register-asset-loader.mjs` 来 stub 静态资源导入。其他包用标准脚本。
- **CI**：尚未接入。仓库没有测试 workflow（只有 `release-desktop.yml`）；把 `pnpm -r test` 加进 CI 是后续。
- **`verify:pre-push`**：尚未扩展跑测试。现在每个有测试文件的包都有 `test` 脚本，可以加 `&& pnpm -r test`——但没测试文件的包会报错，除非过滤或给空操作脚本。暂缓。

## Alternatives considered

**为什么用 `node --test` 而不是 vitest 或 jest？** —— 24 个测试文件里 22 个已经 `import test from "node:test"` 和 `import assert from "node:assert/strict"`。vitest 和 jest 要么靠 shim 重复一遍这套 API，要么重写每个测试文件。`node --test` 直接跑，零新依赖、零配置文件。Node 24 的运行器稳定，对当前测试形态（同步与异步 `test()`、`assert`）足够。

**为什么转换两个 vitest 文件而不是装 vitest？** —— 装 vitest 会给 `@zcode/ui` 加运行时依赖和配置文件，而两个文件只用了基础 `describe`/`it`/`expect`——没有 vitest 专有功能（mock、snapshot、timer）。转换是机械的：`describe("group", () => { it("name", ...) })` 变成 `test("group: name", ...)`，每个 `expect` 映射到等价的 `assert` 调用。语义不变——`node:assert/strict` 的 `assert.equal` 用 `Object.is`，对比较的所有类型（字符串、布尔、null、函数引用）与 vitest 的 `toBe` 一致。

**为什么 `node --test --import tsx` 而不是 `tsx --test`？** —— `tsx` 有自己的 `--test` 包装，但 `node --test --import tsx` 明确表示 Node 内置运行器是权威、`tsx` 只是 loader。这与测试文件的写法（`import test from "node:test"`）意图一致，也保留了将来去掉 `tsx`、改跑编译后 `.js` 测试产物的可能。

**为什么给 glob 加引号？** —— 不加引号，开了 `globstar` 的 bash 会自己展开 `**`，把文件路径传给 Node；没开 `globstar` 的 bash、cmd.exe、PowerShell 会把字面 pattern 传过去。加引号让 Node 在每种 shell 里都自己处理 glob，脚本在各平台行为一致。

**为什么给 UI 用自定义资源 loader 而不是 mock 导入？** —— SVG 导入散落在深层传递依赖链里（renderer 组件 → provider icons → `.svg` 文件）。逐个 mock 需要维护一个随组件树增长的 mock 映射。loader hook 在模块解析层拦截所有静态资源扩展名，当前和未来的导入都覆盖，无需逐文件 mock。

## Consequences

**正面**：

- 94 个测试现在跨七个包执行，包括 `tool-port-wiring.test.ts`——它走完整 executor 链路（deps → call-runner context → handler），本来会在下一次 `pnpm test` 时抓住 `466ec43` 的拆分破坏，而不是等到 `pnpm build` 才暴露。
- 无新依赖、无配置文件。两个 vitest 文件转换为仓库的 `node:test` 约定。
- `pnpm -r test` 从仓库根目录可用，依次跑每个包的测试。
- 任何包的 `test/` 下新增测试自动被发现。

**负面**：

- 测试经 `tsx` 跑源码，不是跑 build 出来的 `dist/`。可能出现测试通过但 build 挂了的情况（比如某非测试文件的 `tsc` 类型错误）。缓解：`pnpm build`（tsc）仍是类型门禁，`pnpm test` 是行为门禁，两者互补而非互替。
- `@zcode/ui` 额外需要一个资源 loader（`register-asset-loader.mjs`），其他包不需要。这是包级关注点，不是仓库级模式。
- 还没进 CI 或 `verify:pre-push`，所以跳过本地 `pnpm test` 的开发者仍能推一个挂掉的测试。
- 没测试文件的包没有 `test` 脚本，从根跑 `pnpm -r test` 会在这些包上报错，除非过滤（如 `pnpm -r --filter "./packages/**" test`）。

## Related

- 记录未被接上的测试本应抓住的破坏的 bug-fix Note：[executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
- workspace_list/list_sessions 工具的特性 Note（其测试在此变更前未接上）：[workspace-list-sessions.md](../feature/2026-10-05-workspace-list-sessions.md)
- 根 `tsx` 依赖：[package.json](../../../../package.json)
- UI 资源 loader：[register-asset-loader.mjs](../../../../packages/ui/test/register-asset-loader.mjs)
