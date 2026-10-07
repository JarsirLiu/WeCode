# Agent Note: Keep remote release platform keys canonical

Status: implemented

English | [中文](2026-10-07-release-platform-key-mismatch.zh.md)

## Problem

The remote asset packer renamed Linux platform keys to electron-builder names (`linux-x86_64` and `linux-aarch64`) when creating GitHub Release assets. The runtime requests and validates the canonical keys (`linux-x64` and `linux-arm64`), so Linux remote deployment failed before downloading any component.

## Decision

The remote asset producer and consumer use the same canonical platform key set: `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`. The packer uses the source platform key for the output directory, manifest filename, manifest `platformArch`, and archive filename prefix. The release workflow validates and publishes that same set.

## Root cause

The packer reused electron-builder architecture vocabulary at the GitHub Release boundary, while the runtime contract was defined by Node-style normalized environment detection. CI only checked that each produced manifest was internally complete; it did not check that its name and `platformArch` matched the runtime request.

## Fix

Removed the release-boundary platform renaming and added regression coverage for the canonical platform set and absence of the Linux aliases in the release workflow and packer.

## Alternatives considered

**Runtime alias fallback** was rejected because it would preserve two public naming contracts and allow future producer drift. **Keeping the alias names and changing runtime detection** was rejected because local mock-cdn assets and existing runtime paths already use the canonical keys.

## Consequences

Existing releases containing the incorrect Linux names need to be re-uploaded with the corrected assets. The release job replaces same-named assets; stale incorrectly named assets should be removed during the repair run. Future remote releases have one unambiguous platform vocabulary.
