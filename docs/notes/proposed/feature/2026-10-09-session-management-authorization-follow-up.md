# Agent Note: Session management authorization follow-up

Status: proposed

中文：[中文版](2026-10-09-session-management-authorization-follow-up.zh.md)

## Problem

The relation's `approvalPolicy` describes how the target session handles permission requests. It must not also decide whether the creator can read, message, stop, or change the model of that session. Conflating the two caused `manual` to reject the first message before the target runtime could create a pending permission request.

## Proposal

- Host session management authorization evaluates caller, target, relation provenance, and operation; a globally unique session ID alone never grants access.
- Permission approval policy applies only after the target runtime emits an exact `requestId`; `manual` is handled by the user UI, while `delegated` may allow an authorized AI caller to resolve a request.
- AI-created sessions currently default to `yolo`; approval policy is not exposed as an AI tool parameter.

## Affected surfaces

Host task/session authorization, relation persistence, AI session management tools, MCP session management tools, cross-workspace routing, and Host replay tests.

## Acceptance criteria

- Define caller, target, and creator relationships for ordinary session management and permission decisions.
- Specify cross-workspace routing and revocation behavior.
- Add a keyless Host replay test covering manual and delegated approval behavior before changing authorization code.

## Risks

An incomplete relationship matrix could either block the creator's ordinary operations or grant access based only on a session identifier. The Host remains the authorization owner; broker-supplied workspace fields are not an authority source.

## Alternatives considered

**Use `approvalPolicy` as the management ACL:** rejected because a permission prompt policy does not express which caller may manage a session.

**Authorize from the session ID alone:** rejected because identifiers are locators, not grants.
