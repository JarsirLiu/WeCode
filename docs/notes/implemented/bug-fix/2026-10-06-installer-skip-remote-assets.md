# Agent Note: Skip remote asset preparation in installer jobs

Status: implemented

## Problem

Desktop installer jobs redundantly prepared all four remote connection asset platforms before packaging. The Windows job therefore spent its installer budget downloading Linux arm64 Node resources even though remote assets are published by a separate matrix job.

## Root cause

`prepare-runtime-assets.mjs` runs `prepare:remote-assets` by default. The release workflow did not pass its existing `ZCODE_SKIP_REMOTE_ASSETS=1` opt-out to installer jobs, so each installer job performed work owned by `build-remote-assets`.

## Decision

All five desktop installer jobs set `ZCODE_SKIP_REMOTE_ASSETS=1`. The dedicated four-platform remote asset matrix remains the only release job that prepares and publishes remote connection resources.

## Fix

The workflow sets the skip flag at installer-job scope and the release workflow test asserts that every installer job has the flag while the remote asset job does not.

## Alternatives considered

**Keep downloading in installer jobs:** This duplicates large network downloads, increases timeout risk, and blurs ownership between installer and remote asset artifacts, so it was rejected.

**Skip remote assets only on Windows:** Linux and macOS installers have the same packaging boundary; limiting the fix to Windows would leave redundant work and inconsistent job behavior, so it was rejected.

## Consequences

Installer jobs become shorter and independent of remote asset download availability. Remote assets still receive full platform coverage through their dedicated matrix job, and production runtime URLs continue to resolve those GitHub Release assets.
