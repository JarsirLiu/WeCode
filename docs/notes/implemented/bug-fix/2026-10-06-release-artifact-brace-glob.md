# Agent Note: Fix GitHub Release installer artifact globs

Status: implemented

English | [中文](2026-10-06-release-artifact-brace-glob.zh.md)

## Problem

Linux and macOS installer builds produced files, but `actions/upload-artifact` failed because `*.{dmg,zip}` and `*.{AppImage,deb,rpm,pkg.tar.zst}` were treated as literal paths.

## Root cause

`actions/upload-artifact` resolves paths with `@actions/glob`; it does not perform shell brace expansion. The workflow passed shell syntax as an action input, so no installer matched.

## Decision

The release workflow uses one explicit `@actions/glob` pattern per installer extension. The build and publish stages retain their existing artifact names and validation boundaries.

## Fix

Each installer extension now has its own glob line. Build, filename validation, and release asset selection remain unchanged. A static workflow test prevents brace globs from returning.

## Alternatives considered

**Upload the entire dist directory:** This would include blockmaps, yml files, and temporary directories outside the installer artifact boundary, so it was rejected.

**Rely on shell expansion before the action:** Action inputs are parsed by the action itself, not by the shell, so this is not reliable and was rejected.

## Consequences

The artifact boundary remains explicit and all four Linux formats plus both macOS formats are matched by the action. The workflow has a few repeated path lines, preventing a build-success/upload-failure release incident.
