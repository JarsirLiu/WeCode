# Docs Guide

Use this guide as the front door to the repo's documentation gate.

It routes you from a problem statement to the right module, spec, and verification path before you write code.

## Start Here

- `AGENTS.md` for repo-wide rules, commands, and required verification.
- `DESIGN.md` before UI changes.
- `CONTEXT.md` for plugin-store domain work.
- `architecture-policy.yaml` for module roots, layers, public entrypoints, and dependency direction.
- `.agents/skills/architecture-governance/SKILL.md` before you change behavior or cross boundaries.
- `.agents/skills/feature-boundary-planner/SKILL.md` when you need impact analysis or a feature-boundary handoff.
- [docs/notes/README.md](notes/README.md) for decision traceability — when to write an Agent Note and how.
- `docs/specs/` for behavior-level specs.

## How to Route a Change

1. Start from the user-visible problem, not the file.
2. Find the owning module from `architecture-policy.yaml` or the feature graph node.
3. Read the nearest spec in `docs/specs/` if one exists.
4. Trace the module's public contract or entrypoint before touching internals.
5. Use the feature-boundary planner if the change crosses UI, service, protocol, persistence, or remote/runtime boundaries.
6. If the change is non-trivial (alters behavior, architecture, a contract, process, or format), check [docs/notes/README.md](notes/README.md) for whether you need to add or update an Agent Note.
7. Verify with the commands named in `AGENTS.md`, plus `pnpm docs:check` for documentation gate validation.

## Common Problem Routes

- UI behavior, layout, and state: `DESIGN.md` + `packages/ui/src`.
- Plugin store semantics and terminology: `CONTEXT.md`.
- Module ownership, layering, and dependency direction: `architecture-policy.yaml`.
- Code-change workflow and design checks: `.agents/skills/architecture-governance/SKILL.md`.
- Behavior impact, state ownership, and protocol/persistence traces: `.agents/skills/feature-boundary-planner/SKILL.md`.
- Feature graph seed index: `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`.
- Existing behavior specs: `docs/specs/`.
- Decision rationale, alternatives, and supersede history: [docs/notes/](notes/README.md).

## Verification

- `pnpm docs:check` — validates Agent Note tree structure, note format, bilingual pairing, and markdown links.
- `pnpm architecture:check --changed` — checks module boundary violations on changed files.
- `pnpm typecheck` and `pnpm lint` — type and lint checks.
- `pnpm verify:pre-push` — lint and architecture checks before push.

## Verification Bias

- Prefer existing docs and contracts before inventing a new pattern.
- Treat the feature graph as a retrieval seed, not a source of truth.
- Report missing specs or missing modules instead of filling the gap silently.
- Specs own current behavior; Agent Notes own the _why_.
