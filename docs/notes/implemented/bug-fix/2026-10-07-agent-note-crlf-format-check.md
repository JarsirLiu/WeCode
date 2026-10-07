# Agent Note: Make Agent Note validation line-ending independent

Status: implemented

English | [中文](2026-10-07-agent-note-crlf-format-check.zh.md)

## Problem

The documentation gate split note files only on LF. Existing notes checked out with CRLF therefore failed header validation even though their visible structure matched the documented format.

## Root cause

`verify-agent-note-format.mjs` used `raw.split("\n")` and compared header lines without removing the carriage return supplied by CRLF files.

## Decision

The validator normalizes the line-ending boundary while leaving note files untouched.

## Fix

The validator now splits on `/\r?\n/`, preserving the same structural checks for both common text-file line endings. No note content or lifecycle rules are changed.

## Alternatives considered

- Normalize every historical note to LF: rejected because it creates unrelated line-ending churn across the documentation tree.
- Relax all header comparisons with ad hoc trimming: rejected because a single normalized split keeps the validator behavior explicit.

## Consequences

Documentation checks are stable across Windows and Unix checkouts. Existing malformed notes, if any, continue to fail the same structural rules.
