# Agent Note: Session management authorization follow-up

Status: implemented

中文：[中文版](2026-10-09-session-management-authorization-follow-up.zh.md)

## Problem

The relation's `approvalPolicy` describes how the target session handles permission requests. It must not also decide whether the creator can read, message, stop, or change the model of that session. Conflating the two caused `manual` to reject the first message before the target runtime could create a pending permission request.

## Decision

- Host session management authorization evaluates caller, target, relation provenance, and operation; a globally unique session ID alone never grants access.
- The desktop `mode` is the only permission mode. `yolo` avoids ordinary permission requests; other modes use the target runtime's pending permission flow.
- The creator AI has the same management and permission-resolution authority as the user for its created target, after Host checks the exact pending `requestId` and creator relation.
- `approvalPolicy` is removed from the active protocol and relation model. The legacy SQLite column remains only for migration compatibility and is not read as behavior.
- Permission audit records retain `resolverKind` and `resolverSessionId` so future policy changes can distinguish AI and user actions.

## Affected surfaces

Host task/session authorization, relation persistence, AI session management tools, MCP session management tools, cross-workspace routing, and Host replay tests.

## Consequences

- AI and users share one visible mode selection and one target runtime permission path.
- A creator AI can resolve a target's exact pending request; unrelated sessions remain denied.
- Existing databases retain the obsolete column until a future destructive migration, but runtime behavior no longer depends on it.

## Testing

Keyless replay coverage must assert creator AI resolution, exact pending request checks, unrelated caller rejection, and audit resolver identity.

## Alternatives considered

**Use `approvalPolicy` as the management ACL:** rejected because a permission prompt policy does not express which caller may manage a session.

**Authorize from the session ID alone:** rejected because identifiers are locators, not grants.
