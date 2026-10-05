# Agent Note: Wire up test scripts across all packages

Status: implemented

[中文](2026-10-05-core-test-script.zh.md)

## Problem

The repository had 24 `*.test.ts` files across seven packages, all targeting Node's built-in test runner via `import test from "node:test"` and `import assert from "node:assert/strict"`, but zero `test` scripts in any `package.json`. The tests were type-checked by `tsc` and nothing else — they never ran, in dev or CI. `verify:pre-push` runs lint + size ratchet + architecture check, but no tests.

The cost was concrete: commit `466ec43` split `call-runner.ts` and shipped 17 type errors that broke `pnpm build`, and `tool-port-wiring.test.ts` — which exercises the executor wiring that the split broke — sat right there in `core/test/` unable to flag it. The test that would have caught the regression existed but was unwired.

## Decision

Add a `test` script to every package that has test files, using the same pattern:

```
"test": "node --test --import tsx \"test/**/*.test.ts\""
```

This uses Node 24's built-in test runner (`node --test`), which the existing test files already target, plus `tsx` (already a root devDependency) as the TypeScript loader. The glob is quoted so Node handles expansion itself, making the script cross-platform (cmd.exe, PowerShell, bash all behave identically).

Seven packages now have the script: `@zcode/core` (15 tests), `@zcode/services` (43), `@zcode/ui` (14), `@zcode/desktop` (10), `@zcode/adapters` (7), `@zcode/provider` (3), `@zcode/bootstrap` (2) — 94 tests total, all passing under `pnpm -r test`.

Two additional changes were needed in `@zcode/ui`:

**Static asset loader**: UI components transitively import `.svg`/`.png`/`.css` assets (e.g., provider icons). `tsx` cannot load these. A custom loader (`test/register-asset-loader.mjs` + `test/asset-loader-hooks.mjs`) stubs them to empty exports via Node's `module.register()` API. The UI test script is `node --test --import tsx --import ./test/register-asset-loader.mjs "test/**/*.test.ts"`.

**Vitest conversion**: Two UI test files (`sessionBotWorkItem.test.ts`, `sessionOrchestrationToolUi.test.ts`) imported from `vitest`, which is not installed anywhere in the repo. They were converted to `node:test` + `node:assert/strict`: `describe` blocks flattened to `test()` calls, `expect(x).toBe(y)` → `assert.equal(x, y)`, `expect(x).toBeNull()` → `assert.equal(x, null)`, `expect(x).not.toBeNull()` → `assert.notEqual(x, null)`. One latent test data bug surfaced: the `row()` helper omitted `inputText`, causing `resolveToolInputPreview` to crash on `undefined.length`; fixed by adding `inputText: ""`.

## Workflow change

- **New command**: `pnpm -r test` runs all 94 tests across seven packages (~50s total). Individual packages: `pnpm --filter @zcode/<name> test`.
- **No new dependency**: `tsx` is hoisted from the root devDependency; `node:test` and `node:assert/strict` are Node built-ins. No package's `devDependencies` changed.
- **Test discovery**: `test/**/*.test.ts` matches the existing test files. New tests added under any package's `test/` directory are picked up automatically.
- **UI asset loader**: the `@zcode/ui` package additionally requires `--import ./test/register-asset-loader.mjs` to stub static asset imports. Other packages use the plain script.
- **CI**: not yet wired. The repository has no test workflow (only `release-desktop.yml`); adding `pnpm -r test` to CI is a follow-up.
- **`verify:pre-push`**: not yet extended to run tests. Now that every package with test files has a `test` script, `&& pnpm -r test` could be added — but packages without test files would error unless filtered or given a no-op script. Deferred.

## Alternatives considered

**Why `node --test` and not vitest or jest?** — 22 of the 24 test files already `import test from "node:test"` and `import assert from "node:assert/strict"`. Vitest and jest would either duplicate that API via shims or require rewriting every test file. `node --test` runs them as written, with no new dependency and no config file. Node 24's runner is stable and sufficient for the current test shape (synchronous and async `test()`, `assert`).

**Why convert the two vitest files instead of installing vitest?** — Installing vitest would add a runtime dependency and a config file to `@zcode/ui`, and the two files used only basic `describe`/`it`/`expect` — no vitest-specific features (mocking, snapshots, timers). The conversion was mechanical: `describe("group", () => { it("name", ...) })` became flat `test("group: name", ...)`, and each `expect` assertion mapped to an equivalent `assert` call. Semantics are preserved — `assert.equal` in `node:assert/strict` uses `Object.is`, which matches vitest's `toBe` for all the compared types (strings, booleans, null, function references).

**Why `node --test --import tsx` and not `tsx --test`?** — `tsx` exposes its own `--test` wrapper, but `node --test --import tsx` makes it explicit that Node's built-in runner is the authority and `tsx` is only the loader. This matches the test files' intent (`import test from "node:test"`) and keeps the door open to drop `tsx` for a zero-loader setup if a package later ships compiled `.js` test artifacts.

**Why quote the glob?** — Without quotes, bash with `globstar` enabled would expand `**` itself and pass file paths to Node; bash without `globstar`, cmd.exe, and PowerShell would pass the literal pattern. Quoting makes Node handle the glob in every shell, so the script behaves identically on every platform.

**Why a custom asset loader for UI instead of mocking imports?** — The SVG imports are scattered across deep transitive dependency chains (renderer components → provider icons → `.svg` files). Mocking each one individually would require maintaining a mock map that grows with the component tree. A loader hook intercepts all static asset extensions at the module resolution layer, handling current and future imports without per-file mocks.

## Consequences

**Positive**:

- 94 tests now execute across seven packages, including `tool-port-wiring.test.ts` which exercises the full executor chain (deps → call-runner context → handler) and would have flagged the `466ec43` split break at the next `pnpm test` instead of at the next `pnpm build`.
- No new dependencies, no config files. Two vitest files converted to the repo's `node:test` convention.
- `pnpm -r test` works from the repo root, running every package's tests in sequence.
- New tests added under any package's `test/` directory are automatically discovered.

**Negative**:

- Tests run against source via `tsx`, not against the built `dist/`. A test can pass while the build is broken (e.g., a `tsc`-only type error in a non-test file). Mitigation: `pnpm build` (tsc) remains the type gate; `pnpm test` is the behavior gate. The two are complementary, not substitutes.
- The `@zcode/ui` package requires an additional asset loader (`register-asset-loader.mjs`) that other packages don't need. This is a package-specific concern, not a repo-wide pattern.
- Not in CI or `verify:pre-push` yet, so a developer who skips local `pnpm test` can still push a broken test.
- Packages without test files don't have a `test` script, so `pnpm -r test` from root errors on them unless filtered (e.g., `pnpm -r --filter "./packages/**" test`).

## Related

- Bug-fix note for the break the unwired tests failed to catch: [executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
- Feature note for the workspace_list/list_sessions tools whose test was unwired until this change: [workspace-list-sessions.md](../feature/2026-10-05-workspace-list-sessions.md)
- Root `tsx` dependency: [package.json](../../../../package.json)
- UI asset loader: [register-asset-loader.mjs](../../../../packages/ui/test/register-asset-loader.mjs)
