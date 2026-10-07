# Agent Note: Recognize v-prefixed release URLs

Status: implemented

English | [中文](2026-10-07-release-url-v-prefix.zh.md)

## Problem

The runtime received a GitHub Release base ending in `v3.14.3`, while the application version was `3.14.3`. The resolver compared the strings literally and generated an unnecessary `/v3.14.3/3.14.3/` request before the valid URL. On slow networks that wasted the manifest timeout and made a valid Release look unavailable.

## Decision

Release URL resolution normalizes an optional leading `v` on the final URL path segment before comparing it with the single application version. A current-version GitHub Release base produces exactly one candidate; unpinned and mismatched bases preserve their existing candidate order.

## Root cause

Pinned-base detection only matched a path suffix of `/${version}` and did not normalize Git tags' leading `v`.

## Fix

Pinned-base detection parses the final URL path segment and compares versions after removing an optional leading `v`.

## Alternatives considered

- **Change the Release URL to omit `v`:** rejected because GitHub tag-triggered release URLs are canonically `v`-prefixed.
- **Hide the first request with a longer timeout:** rejected because it preserves an invalid request and delays every deployment on a valid configuration.

## Consequences

Valid GitHub Release manifests no longer incur a duplicate-version request. The replay test locks the `v` prefix behavior, while unpinned and mismatched versions remain explicit fallback cases.
