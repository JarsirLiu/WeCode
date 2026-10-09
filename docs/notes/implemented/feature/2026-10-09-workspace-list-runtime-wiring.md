# Agent Note: WorkspaceList Runtime wiring

Status: implemented

中文：[中文版](2026-10-09-workspace-list-runtime-wiring.zh.md)

## Problem

The Host workspace index and `WorkspaceList` handler already existed, but Protocol App creation did not consistently provide the workspace index port. A session could therefore create and list sessions while failing to discover registered workspaces. Temporary text-generation runtimes also had no explicit boundary for session orchestration tools.

## Decision

The Protocol App helper is the single assembly boundary for complete Session Runtime capabilities. Session creation and recovery opt into one group of four brokers: task, session, permission, and workspace index. Explicit caller ports remain authoritative. Temporary model connectivity and text-generation apps do not opt in and do not expose session orchestration tools.

`WorkspaceList` continues to read only `ISettingService.listWorkspaces()` through the Host reverse protocol. It does not scan disk or infer workspaces from the current working directory.

## Affected surfaces

Protocol App assembly, Core Runtime tool registration, Host workspace index reverse protocol, session creation and recovery, and temporary model-generation runtimes.

## Alternatives considered

Keeping per-call-site port wiring was rejected because legacy, V4, and recovery paths could drift. Adding a filesystem scan fallback was rejected because it would fabricate a list that is not the Host's registered-workspace index.

## Consequences

The runtime capability boundary is explicit and consistent. Missing Host index service remains a visible structured failure. Tests must cover the enabled Session Runtime and the disabled temporary Runtime separately.

