# Agent Note: Put installer downloads above release assets

Status: implemented

English | [中文](2026-10-07-release-installer-download-section.zh.md)


## Problem

The Release Assets list contains installer packages alongside dozens of remote connection resources. GitHub does not provide a workflow-controlled pinned ordering for Assets, so users must scan the resource files to find the desktop installers.

## Decision

The publish job now builds a stable Markdown `Download installers` section in the Release description. It links all expected Linux, macOS DMG, and Windows installer filenames to the tag's GitHub release-download URLs and groups them by platform. macOS ZIP archives are not uploaded as release assets. The section is applied after both new-release creation and existing-release retries, while the generated changelog body is preserved below it. Remote resource manifests and archives remain available as Assets but are intentionally excluded from the download section.

## Workflow change

`.github/workflows/release-desktop.yml` owns the installer list and writes the description through `gh release edit --notes-file`. The static release workflow test verifies every expected installer appears and that both create and retry paths update the notes.

## Alternatives considered

- Rely on GitHub Assets ordering: rejected because ordering is not a stable workflow contract.
- Upload duplicate installer assets with a prefix: rejected because it increases release size and creates ambiguous download choices.
- Remove remote assets from the Release: rejected because clients download those resources from the same tag.

## Consequences

Users see direct installer links above the long Assets list. Release notes gain a small generated section, and retries replace that section rather than appending duplicates. Asset filenames and remote-resource publication semantics remain unchanged.
