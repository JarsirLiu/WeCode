# Compact Prompt V2

## Scope

Compact Prompt V2 changes only the model instructions used to generate a conversation summary. It does not change automatic compact thresholds, message selection, model selection, retry behavior, persistence, microcompact, or reactive compact.

## Configuration

`compact.promptVersion` selects the prompt:

- `v2` is the default and enables the handoff-ledger prompt.
- `v1` remains available as an explicit rollback option.

Invalid values are rejected by configuration parsing. The setting is read when a compact model request is built; changing it does not rewrite existing summaries.

## V2 invariants

The V2 prompt must require one outer `<summary>...</summary>` block and must not require nested summary tags. It must:

- treat the previous compact summary as the baseline for stable facts;
- copy still-valid stable facts verbatim instead of paraphrasing them;
- preserve exact user preferences, prohibitions, security constraints, absolute paths, URLs, identifiers, and configuration keys;
- separate stable facts from active requirements and changing progress;
- mark uncertain information as `UNVERIFIED`;
- record explicit updates and superseded decisions rather than silently replacing them;
- preserve explicitly requested work and distinguish it from optional suggestions;
- avoid full source files, full tool output, and exhaustive historical message transcripts;
- prioritize stable facts and active constraints over completed exploration when output budget is limited;
- treat current workspace/tool facts and system context as authoritative when they conflict with the summary.

## Output sections

The generated summary contains stable user preferences, stable project references, stable environment facts, active requirements and acceptance criteria, decisions and architectural constraints, current progress, verification, open issues and unverified assumptions, superseded information, and the explicit next action.

## Example-data policy

Examples in this spec and related proposal records must use obvious placeholders. Do not include real developer machine paths, usernames, workspace names, repository locations, service addresses, or other local environment values.

## Migration boundary

V1 remains the default for rollback. V2 summaries use the existing summary parser and persistence format, so existing sessions remain readable and do not require migration.

## Acceptance scenarios

1. A user-provided reference path such as `<reference-project-path>` remains byte-for-byte identical after repeated compaction.
2. A preference such as "only investigate; do not modify code" remains an active constraint and is not converted into completed work.
3. A later explicit decision replaces an earlier decision and records the superseded value and evidence.
4. An unverified path or version is recorded as `UNVERIFIED`, not guessed.
5. V1 output remains unchanged when `compact.promptVersion` is explicitly set to `v1`; omitted configuration uses V2.
