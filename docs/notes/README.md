# Agent Notes

English | [中文](README.zh.md)

One kind of design doc lives here. An **Agent Note** records a decision or proposal that affects this codebase — the _why_ and _what we gave up_, the parts code and docs can't carry. This file defines where Agent Notes live, when to write one, and [the in-file format](#the-file-format).

## Layout and naming

Every Agent Note has two axes, both encoded in its **path** — `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`:

- **Lifecycle** (the top-level folder) is the Agent Note's status, and an Agent Note moves between folders as that status changes:
  - **`proposed/`** — proposals reviewed before implementation; not yet built (or only partly).
  - **`implemented/`** — the decision shipped. The file records what was decided and what was rejected, and is **kept current with what actually shipped**: when the code later moves a file, renames a package, or changes a key/default, the Agent Note is updated in the same change to match (facts only — paths, names, structure — not the decision itself).
  - **`rejected/`** — the proposal was considered and declined. Keep it only while its rationale prevents a tempting, meaningful mistake; otherwise delete the complete pair.
- **Class** (the nested folder) is the _kind_ of decision — see [Classification](#classification) below.

The date in the filename is when the topic was **first proposed** (per git history). Cross-references between Agent Notes use relative markdown links (`[topic](../../implemented/architecture/2026-…-….md)`) — never bare prose or numbers — so they are mechanically checkable and survive moves between folders.

Do not add a centralized `INDEX.md`; browse the lifecycle/class folders or search the repository.

## Classification

Each Agent Note belongs to one path-encoded class from the closed set in `scripts/docs/agent-note-tree.mjs`; the classification gate rejects other folders. Adding a class requires updating the canonical set and this section.

| Class            | What it covers                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `feature`        | A new user- or model-facing capability.                                                                          |
| `bug-fix`        | Corrects a defect or closes a gap a postmortem surfaced.                                                         |
| `simplification` | Removes code, behavior, or surface area without adding a capability.                                             |
| `architecture`   | A structural decision about the **shipped source** — how packages relate, what the runtime vocabulary is.        |
| `process`        | Tooling, policy, or workflow **around** the code — gates, the package manager, vendoring — not runtime behavior. |
| `testing`        | Test infrastructure and strategy.                                                                                |

The `architecture` / `process` line: **architecture** is about the source we ship; **process** is the surrounding tooling and workflow. (`refactor` is deliberately absent — it overlaps `simplification`, whose discriminator, "does observable behavior change?", already covers it.)

## Archiving and deletion

Archive an implemented Agent Note when the shipped decision is complete and its rationale is unlikely to guide future work. Keep it active when its alternatives, ownership boundary, negative guarantee, durable or wire semantics, security rule, or reintroduction condition remains useful. Never archive a proposed note: reject an obsolete proposal. Keep a rejected note only while it prevents a plausible mistake; otherwise delete its English and Chinese files together.

The archive is path-encoded as `archived/{class}/yyyy-mm-dd-topic-title.md`; `implemented` is deliberately absent because only implemented notes can enter it. An archival change moves the complete English/Chinese pair, retains `Status: implemented`, inserts the same `Archived: YYYY-MM-DD` line immediately below that status in both language files, and repairs or deletes inbound links. These are the only permitted content changes during archival.

Once sealed, every archived pair is permanently frozen. Do not edit, translate, reformat, update, move, or delete it, and do not treat it as authority for current behavior. Documentation gates skip archived sources, including their outbound links; active prose may still link into an archived note when it intentionally cites history. `verify-agent-note-format` and `verify-translation-pairing` enforce the rules described here.

## When to write one

Every non-trivial change MUST add or update at least one Agent Note in the same change. A change is non-trivial when it alters behavior, architecture, a contract shared across files or packages, process or tooling, testing strategy, an on-disk, wire, or configuration format, or another decision a maintainer may reasonably revisit. A proposal for substantial future work starts in `proposed/`; a decision already made starts in `implemented/`. Pick the class folder that matches the decision (see [Classification](#classification)).

Updating the Agent Note that already owns the decision satisfies the rule; do not create a duplicate. Only a purely mechanical or local edit with no change to behavior, contracts, structure, process, or rationale is exempt. An Agent Note is never edited into a _different decision_: supersede it with a new one, and keep both notes cross-linked. Editing an `implemented/` Agent Note to track where its existing decision lives is required, not forbidden.

An implemented Agent Note that is fully superseded may be consolidated into the current owning note and deleted. Before deletion, the owner must preserve every unique rationale, alternative, consequence, required verification, and named coverage gap; repair every inbound link; and delete the Chinese counterpart in the same change. Partial supersession does not qualify: keep both notes cross-linked and update every fact that remains current.

## How Agent Notes relate to existing docs

- **`docs/specs/`** is the source of truth for _current behavior_. Agent Notes record _why_ the behavior is what it is.
- **`AGENTS.md`** sets repo-wide rules and verification commands. Agent Notes are one of those verification inputs.
- **`architecture-policy.yaml`** defines module boundaries. An `architecture` Agent Note may explain _why_ a boundary exists, but does not redefine it.
- **`.agents/skills/`** are workflow guides. An `process` Agent Note may explain _why_ a workflow exists, but does not replace the skill.

When behavior changes, update the spec first. When the _reason_ for the behavior changes, write or update an Agent Note.

## The file format

Every active Agent Note follows one in-file format, enforced by `pnpm docs:check` ([verify-agent-note-format](../../scripts/docs/verify-agent-note-format.mjs)).

### The header block

The first three lines of every Agent Note are exactly:

```markdown
# Agent Note: <title>

Status: <status>
```

followed by a blank line. The `Status:` value is one of three forms, and must agree with the lifecycle folder the file sits in — the gate cross-checks them:

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <why, in one line>`

The status carries no dates and no parentheticals: the filename holds the first-proposed date, git holds everything else, and an "accepted in amended form" note is body content (state the amendment where the decision is stated). The rejection reason is the one status with content, because a rejected Agent Note's verdict is the fact readers come for.

### The body skeleton

Every Agent Note opens its body with `## Problem` — the motivation, written to stand without the solution. What follows depends on the lifecycle; recurring sections use these canonical names and nothing else, while genuinely bespoke technical sections remain free-form between the required ones.

#### `proposed/`

```markdown
## Problem

## Proposal

…bespoke sections…

## Alternatives considered

## Acceptance criteria

## Risks
```

`## Proposal` is the intended change and may legitimately speak in the future tense — plans, migration steps, and open questions belong here while the work is unbuilt. `## Acceptance criteria` says what observable state means done. `## Risks` covers both what could go wrong and what the change knowingly gives up.

#### `implemented/`

```markdown
## Problem

## Decision

…bespoke sections…

## Alternatives considered

## Consequences
```

`## Decision` describes shipped reality in the present tense, and the whole file is kept current with it. `## Consequences` records what the trade-off cost **and** bought. Proposal-era headings are spec-speak here and the gate rejects them: `## Proposal`, `## Plan`, `## Migration plan`, and `## Acceptance criteria` may not appear in an implemented Agent Note. A `## Testing`, `## Deferred`, or `## Related` section is fine where it states present-tense fact.

#### `rejected/`

A rejected Agent Note is the proposal, frozen: it keeps whatever proposal-time sections it had (including `## Acceptance criteria` or `## Plan`), and the verdict lives on the `Status:` line. Only the header block, the `## Problem` opener, a `## Proposal` section, and the Alternatives-considered mandate below apply.

### Class-specific sections

Beyond the lifecycle skeleton, each class adds mandatory sections that pin the _kind_ of decision. These go in the "bespoke sections" slot between `## Proposal`/`## Decision` and `## Alternatives considered`. The gate enforces them for `proposed/` and `implemented/` notes; `rejected/` notes are exempt.

| Class            | Required sections                                | What to record                                                                                                                 |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `feature`        | `## Affected surfaces`                           | Which UI, service, protocol, persistence, or runtime surfaces the feature touches.                                             |
| `bug-fix`        | `## Root cause`, `## Fix`                        | The defect's origin; what was changed to fix it.                                                                               |
| `simplification` | `## What was removed`, `## Reintroduction guard` | What code/behavior/surface was removed; the condition under which it might return and what prevents accidental reintroduction. |
| `architecture`   | `## Module boundary`                             | Which modules/packages are affected and how their boundary or dependency direction changes.                                    |
| `process`        | `## Workflow change`                             | What changes in the development/validation workflow, and which gates or tools are affected.                                    |
| `testing`        | `## Test scope`                                  | What tests are added or changed, what they cover, and what coverage gap they close.                                            |

For `proposed/` notes, class-specific sections may speak in the future tense. For `implemented/` notes, they state present-tense fact. Adding a class is a deliberate act: extend the `CLASS_REQUIRED` map in `verify-agent-note-format.mjs` AND this table.

### Alternatives considered — mandatory

Every Agent Note carries an `## Alternatives considered` section: each genuine alternative and why it lost, one bold-led paragraph per alternative or a `### Why not <X>?` subsection per contested one. A decision recorded without what it beat invites re-litigation — the failure Agent Notes exist to prevent.

### Moving between lifecycles

Moving a file between lifecycle folders means updating the `Status:` line and re-satisfying that folder's skeleton in the same change — the gate fails the move otherwise. Concretely, `proposed/` → `implemented/` rewrites `## Proposal` into a present-tense `## Decision`, folds `## Acceptance criteria` and `## Risks` into `## Consequences` (or a present-tense `## Testing`/`## Verification` section for what now pins the behavior), and drops plans in favor of what shipped. `proposed/` → `rejected/` only adds the reason to the `Status:` line and freezes the file.

### Chinese counterparts

A `.zh.md` counterpart mirrors its English sibling's structure section-for-section; the machine-checked header tokens (`# Agent Note: ` and the `Status:` line) stay in English verbatim. The format gate skips `.zh.md` files — the pairing gate checks their consistency.

## Verification

Run `pnpm docs:check` from the repo root. This executes:

1. **`agent-note-tree`** — tree structure: lifecycle and class folders against the closed set, filename format.
2. **`verify-agent-note-format`** — header block, Status line, lifecycle-specific sections, class-specific sections, alternatives, banned headings.
3. **`verify-translation-pairing`** — bilingual pair completeness, H2 structure consistency, language switcher links.
4. **`verify-md-links`** — relative links resolve to existing files; `#fragment` anchors match heading slugs or explicit `<a id>` anchors.
5. **`verify-md-wrap`** — one-line-per-paragraph; code blocks, tables, lists, HTML comments exempt.
6. **`verify-doc-budgets`** — word budget per document from `scripts/doc-budgets.manifest.json`; `pnpm docs:budgets` lists current counts.
7. **`verify-doc-refs`** — `docs/...md` path references in TypeScript source exist (reverse of link check).
8. **`verify-archived-agent-notes`** — archived notes are frozen (sha256 manifest); `--write` re-seals after intentional changes.

Pre-commit reminder (non-blocking): `verify-agent-note-reminder` warns when source files change without a note, but does not fail.
