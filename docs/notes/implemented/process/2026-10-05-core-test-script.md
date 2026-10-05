# Agent Note: Wire up @zcode/core test script

Status: implemented

[中文](2026-10-05-core-test-script.zh.md)

## Problem

The `@zcode/core` package had three test files (`compact-prompt.test.ts`, `tool-port-wiring.test.ts`, `workspace-list-sessions.test.ts`) targeting Node's built-in test runner via `import test from "node:test"` and `import assert from "node:assert/strict"`, but no `test` script in `package.json`. The tests were type-checked by `tsc` and nothing else — they never ran, in dev or CI. This is not unique to core: the whole repository ships 23 `*.test.ts` files across eight packages and zero `test` scripts. `verify:pre-push` runs lint + size ratchet + architecture check, but no tests.

The cost was concrete: commit `466ec43` split `call-runner.ts` and shipped 17 type errors that broke `pnpm build`, and `tool-port-wiring.test.ts` — which exercises the executor wiring that the split broke — sat right there in `core/test/` unable to flag it. The test that would have caught the regression existed but was unwired.

## Decision

Add a `test` script to `@zcode/core`'s `package.json`:

```
"test": "node --test --import tsx \"test/**/*.test.ts\""
```

This uses Node 24's built-in test runner (`node --test`), which the existing test files already target, plus `tsx` (already a root devDependency) as the TypeScript loader. The glob is quoted so Node handles expansion itself, making the script cross-platform (cmd.exe, PowerShell, bash all behave identically).

## Workflow change

- **New command**: `pnpm --filter @zcode/core test` runs all 15 tests in `core/test/` (~4s). From inside the package directory, `pnpm test`.
- **No new dependency**: `tsx` is hoisted from the root devDependency; `node:test` and `node:assert/strict` are Node built-ins. The package's `devDependencies` are unchanged.
- **Test discovery**: `test/**/*.test.ts` matches the existing test files. New tests added under `core/test/` are picked up automatically.
- **CI**: not yet wired. The repository has no test workflow (only `release-desktop.yml`); adding `pnpm -r test` to CI is a separate, follow-up process change.
- **`verify:pre-push`**: not yet extended. Adding `&& pnpm -r test` would make the pre-push gate run tests, but only after every package has a `test` script — otherwise it errors on the packages that lack one. Deferred.

The same pattern applies to the other seven packages that have test files but no script (`packages/services`, `packages/ui`, `packages/desktop`, `packages/provider`, `apps/zcode-cli/packages/adapters`, `apps/zcode-cli/packages/bootstrap`, and `packages/formal-proof` if it grows tests). Rolling this out is mechanical and tracked as a follow-up.

## Alternatives considered

**Why `node --test` and not vitest or jest?** — The existing 23 test files all `import test from "node:test"` and `import assert from "node:assert/strict"`. Vitest and jest would either duplicate that API via shims or require rewriting every test file. `node --test` runs them as written, with no new dependency and no config file. Node 24's runner is stable and sufficient for the current test shape (synchronous and async `test()`, `assert`).

**Why `node --test --import tsx` and not `tsx --test`?** — `tsx` exposes its own `--test` wrapper, but `node --test --import tsx` makes it explicit that Node's built-in runner is the authority and `tsx` is only the loader. This matches the test files' intent (`import test from "node:test"`) and keeps the door open to drop `tsx` for a zero-loader setup if the package later ships compiled `.js` test artifacts.

**Why quote the glob?** — Without quotes, bash with `globstar` enabled would expand `**` itself and pass file paths to Node; bash without `globstar`, cmd.exe, and PowerShell would pass the literal pattern. Quoting makes Node handle the glob in every shell, so the script behaves identically on every platform.

## Consequences

**Positive**:
- 15 tests now execute, including `tool-port-wiring.test.ts` which exercises the full executor chain (deps → call-runner context → handler) and would have flagged the `466ec43` split break at the next `pnpm test` instead of at the next `pnpm build`.
- No new dependencies, no config files, no rewrite of existing tests.
- Establishes the convention the rest of the repo can copy: `node --test --import tsx "test/**/*.test.ts"`.

**Negative**:
- Tests run against source via `tsx`, not against the built `dist/`. A test can pass while the build is broken (e.g., a `tsc`-only type error in a non-test file). Mitigation: `pnpm build` (tsc) remains the type gate; `pnpm test` is the behavior gate. The two are complementary, not substitutes.
- Only `@zcode/core` is wired. The other seven packages with test files still cannot run theirs until the same script is added. A regression in, say, `packages/services` would still escape `pnpm test` from root.
- Not in CI or `verify:pre-push` yet, so a developer who skips local `pnpm test` can still push a broken test.

## Related

- Bug-fix note for the break the unwired tests failed to catch: [executor-split-wiring.md](../bug-fix/2026-10-05-executor-split-wiring.md)
- Test files now executable: [core/test/](../../../../apps/zcode-cli/packages/core/test/)
- Root `tsx` dependency: [package.json](../../../../package.json)
