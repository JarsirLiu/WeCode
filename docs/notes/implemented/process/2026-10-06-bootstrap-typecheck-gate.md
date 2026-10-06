# Agent Note: Include Bootstrap In The Root Typecheck Gate

Status: implemented

English: [中文版本](2026-10-06-bootstrap-typecheck-gate.zh.md)

## Problem

Desktop startup builds `@zcode/bootstrap`, but the root `pnpm typecheck` command did not include that project. A cross-package option added by the workspace index wiring therefore passed routine typecheck and failed only during desktop startup.

## Decision

The root typecheck project list now includes `apps/zcode-cli/packages/bootstrap/tsconfig.json`. Bootstrap remains independently buildable; this change only makes the existing preflight gate cover the package that desktop startup compiles.

## Workflow change

Run `pnpm typecheck` before `pnpm dev:desktop`; the shared command now checks the bootstrap project as part of the normal preflight.

## Alternatives considered

**Rely on `pnpm dev:desktop`** was rejected because it discovers type errors too late and starts a long-running build process. **Add a separate undocumented command** was rejected because contributors would continue to run the incomplete root gate.

## Consequences

Cross-package contract drift between protocol assembly and `ZCodeAppOptions` is reported before launching Electron. This does not replace the bootstrap build: bundler, export, and generated-artifact failures still require the desktop build path.

## Verification

The bootstrap project typechecks independently, and the root typecheck invokes it together with the existing service, client, server, and desktop host projects.
