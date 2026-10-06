# Agent Note: Publish remote connection assets on GitHub Releases

Status: implemented

English | [中文](2026-10-06-github-release-remote-assets.zh.md)

## Problem

Remote connection assets were built in CI but the runtime URL and GitHub Release layout did not agree. Release uploads are flat, so platform-specific files could collide, and a base URL without the tag could not address the published assets.

## Decision

Tag builds compile the exact `https://github.com/<repo>/releases/download/<tag>` base into the desktop runtime. The runtime recognizes this already-pinned GitHub Release form and does not append the normal zcode CDN path. The packer prefixes every component archive with its normalized platform, and publish validates and uploads four supported remote-platform manifests plus their uniquely named archives from the flattened artifact directory.

Manual workflow builds leave the release base empty and therefore retain the normal development/default CDN behavior; they do not publish a Release.

## Workflow change

The release workflow selects one remote platform per matrix job, validates four normalized platform manifests, and collects flat asset files by manifest and filename prefix before the only Release-writing job runs. The desktop test covers URL resolution, while typecheck, lint, architecture, size, and documentation gates remain required.

## Alternatives considered

- Keeping zcode CDN as a fallback for published assets would hide incomplete Release uploads and make the source of production assets ambiguous.
- Preserving artifact subdirectories would not work because GitHub Release assets are addressed by basename, not directory hierarchy.

## Consequences

Release assets are independently addressable and cannot overwrite another platform's component. A release must contain all four supported remote-platform manifests and matching archives before publication. Existing non-Release CDN behavior is unchanged.
