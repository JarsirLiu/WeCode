# Agent Note: Session management authorization follow-up

Status: proposed

中文：[中文版](2026-10-09-session-management-authorization-follow-up.zh.md)

## Problem

The relation's `approvalPolicy` describes how the target session handles permission requests. It must not also decide whether the creator can read, message, stop, or change the model of that session. Conflating the two caused `manual` to reject the first message before the target runtime could create a pending permission request.

## Proposed boundary

- Host session management authorization evaluates caller, target, relation provenance, and operation; a globally unique session ID alone never grants access.
- Permission approval policy applies only after the target runtime emits an exact `requestId`; `manual` is handled by the user UI, while `delegated` may allow an authorized AI caller to resolve a request.
- AI-created sessions currently default to `yolo`; approval policy is not exposed as an AI tool parameter.

## Next design work

Define the caller/target/creator relation matrix, ordinary management operations, permission decisions, cross-workspace routing, and revocation behavior. Add a keyless Host replay test before changing `resolveManagedTarget` or `resolveSessionPermission`.
