# Agent Note: Create sessions require a first message and default to yolo

Status: implemented

中文：[中文版](2026-10-09-create-session-first-message-and-yolo.zh.md)

## Problem

Allowing an AI-created session without a first message leaves an empty session that cannot perform the requested work. The historical optional `initialPrompt` field made the orchestration contract inconsistent. Exposing `manual` alongside creation also made it easy to confuse target permission handling with session management authorization.

## Decision

- `CreateSession.content` is required and is submitted through the same Host task service after creation.
- The default mode is `yolo` when the caller omits `mode`.
- Public AI and MCP creation contracts remove `initialPrompt` and `approvalPolicy`; MCP uses required `message`.
- If first-message submission fails, the tool fails while the created session remains available for the user.
- Session management authorization and target permission approval are tracked as a separate design problem; this change does not alter the Host authorization model.
- The initial management milestone covers `yolo` sessions: the creator can send, read, stop, change model, and compact its target session. `approvalPolicy` must not block these ordinary operations; permission resolution remains outside this milestone.

## Affected surfaces

AI and MCP CreateSession schemas, their Host handlers, the session orchestration UI projection, feature specifications, and protocol replay tests are updated.

## Alternatives considered

**Keep the first message optional:** rejected because it allows empty AI-created sessions and requires a second tool call for the requested work.

**Expose approvalPolicy on CreateSession:** rejected because this couples target permission handling to session management authorization.

**Roll back the created session if message submission fails:** rejected because it would introduce a second lifecycle and rollback path; the retained session remains user-visible and can be continued.

## Consequences

Existing callers must provide `content` or `message`. The UI projects only the first `content` and no longer displays the historical approval policy field.
