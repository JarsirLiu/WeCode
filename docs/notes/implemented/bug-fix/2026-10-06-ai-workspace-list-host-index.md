# Agent Note: AI WorkspaceList Uses the Host Index

Status: implemented

English: [中文版本](2026-10-06-ai-workspace-list-host-index.zh.md)

## Problem

AI `WorkspaceList` previously inferred workspaces from persisted tasks under `process.cwd()`, which omitted remote and task-less workspaces and generated synthetic identities that did not match Host routing.

## Root cause

The tool was attached to `ZCodeTaskPort.listTasks()` even though the Host already owned a settings-backed workspace index. The handler also invented project type and activity fields that had no authoritative source.

## Decision

AI workspace discovery now has a dedicated `WorkspaceIndexPort` and `workspace/list` reverse protocol route to a Host executor backed by `ISettingService.listWorkspaces()`. The tool returns only index-owned metadata, using the path as the local identity key when no explicit identity exists. Registration is gated independently from task/session tools. MCP continues to use its own ACL and transport handler while sharing the Host settings index as its data source.

## Fix

The handler no longer calls `process.cwd()` or `listTasks()` and no longer invents project/activity fields. A dedicated broker and Host executor now validate and return the settings index.

## Affected surfaces

The change touches the AI tool contract and handler, core runtime port plumbing and tool registration, the shared reverse-protocol schema, bootstrap broker, and Host service executor. The AI caller session remains trusted request context; it does not filter the Host workspace index.

## Alternatives considered

**Continue aggregating `listTasks()`** was rejected because it cannot represent workspaces without tasks, remote workspaces, or stable Host-owned identity.

**Reuse the MCP HTTP endpoint** was rejected because AI runtime must not depend on an external transport, MCP enablement, or MCP authorization context.

**Add workspace listing to the task/session executor** was rejected because workspace discovery belongs to the Host settings index and should not enlarge the task/session service contract.

## Consequences

Workspace results now match the Host settings index and include task-less and remote entries without exposing remote target credentials. `projectType`, activity timestamps, and active-session counts are no longer returned because the authoritative index does not own them. If those fields become necessary, they require explicit Host-owned sources and contracts.

## Testing

The no-secret replay covers AI handler port usage and the Host `workspace/list` relay through the settings-backed index, including local, remote, and task-less workspaces. Desktop startup is not part of this change or its tests.
