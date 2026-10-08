import assert from "node:assert/strict";
import test from "node:test";
import type { SessionInfo } from "@zcode/contracts";
import { matchesListedWorkspace } from "../src/zcode-protocol/list-session-workspace-match.js";
import { listSessions as listProtocolSessions } from "../src/zcode-protocol/server-operations.js";

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    id: "sess_test" as SessionInfo["id"],
    projectID: "project_test" as SessionInfo["projectID"],
    slug: "test",
    directory: "D:\\codespace\\sql_agent",
    title: "Test session",
    version: "1",
    time: { created: 1, updated: 2 },
    ...overrides,
  } as SessionInfo;
}

test("local workspace listing matches legacy sessions by path when workspace_id is absent", () => {
  assert.equal(
    matchesListedWorkspace(session({}), {
      workspaceIdentity: "D:\\codespace\\sql_agent",
      workspacePath: "D:\\codespace\\sql_agent",
    }),
    true,
  );
});

test("session/list protocol returns legacy local rows selected from the session store by path", async () => {
  const path = "D:\\codespace\\sql_agent";
  const legacySession = session({ directory: path });
  const requestedDirectories: string[] = [];
  const context = {
    deps: {
      sessionStore: {
        listSessions: async (input: { directory?: string }) => {
          if (input.directory) requestedDirectories.push(input.directory);
          return [legacySession];
        },
      },
    },
    sessions: new Map(),
  } as never;

  const result = await listProtocolSessions(context, {
    workspace: { workspacePath: path, workspaceIdentity: path, workspaceKey: path },
  });

  assert.deepEqual(requestedDirectories, [path]);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0]?.sessionId, "sess_test");
  assert.equal(result.sessions[0]?.title, "Test session");
});

test("local workspace listing still rejects sessions from another path", () => {
  assert.equal(
    matchesListedWorkspace(
      session({ directory: "D:\\other\\project" }),
      {
        workspaceIdentity: "D:\\codespace\\sql_agent",
        workspacePath: "D:\\codespace\\sql_agent",
      },
    ),
    false,
  );
});

test("remote workspace listing requires exact identity and never falls back to matching path", () => {
  assert.equal(
    matchesListedWorkspace(
      session({ directory: "/srv/app", path: "/srv/app" }),
      {
        workspaceIdentity: "remote:ssh:host:22:user:/srv/app",
        workspacePath: "/srv/app",
      },
    ),
    false,
  );
  assert.equal(
    matchesListedWorkspace(
      session({ workspaceID: "remote:ssh:host:22:user:/srv/app" as SessionInfo["workspaceID"] }),
      {
        workspaceIdentity: "remote:ssh:host:22:user:/srv/app",
        workspacePath: "/srv/app",
      },
    ),
    true,
  );
});
