# Agent Note: MCP session target resolution

Status: implemented

中文：[中文版](2026-10-06-mcp-session-target-resolution.zh.md)

## Problem

The MCP bridge checked the workspace on every session operation using only the current request arguments. After `create_session`, clients normally keep only the returned session id, so `read_session` and message operations were rejected as if the workspace were unauthorized. `initialPrompt` was also advertised but never submitted.

## Decision

The Host task service exposes `resolveTaskTarget({ taskId })`, backed by the existing task index and in-memory target map. MCP session operations resolve `workspacePath` and `workspaceIdentity` from that Host-owned record, then apply the workspace ACL. Session tool schemas do not require workspace fields. `create_session.initialPrompt` is submitted through the same task service after creation; a failed submission fails the MCP call instead of returning an empty-session success. Model selection uses the shared picker parser or the structured selection, V4 compact does not advertise unsupported instructions, and delegated permission decisions map to the V4 allow/deny response while preserving the option id.

## Affected surfaces

The public task service contract, task adapter, MCP Host bridge, tool descriptions, MCP feature specification, and protocol replay tests are updated. No second session registry or MCP-local workspace cache is introduced.

## Alternatives considered

**Require workspacePath on every call:** rejected because it duplicates Host-owned session identity and caused the observed read/send failure.

**Resolve from MCP process memory:** rejected because it would diverge after Host restart and create a second source of truth.

## Consequences

External agents can manage a session with its returned id alone. Workspace authorization remains fail-closed and Host-owned. A session whose initial prompt cannot be admitted is reported as an error, so callers must retry or create a new session explicitly.
