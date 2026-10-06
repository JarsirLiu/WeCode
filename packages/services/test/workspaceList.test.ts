import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceSummaries } from "../src/setting/workspaceIndex.js";

test("workspace index merges persisted local and remote entries without duplicates", () => {
  const result = buildWorkspaceSummaries({
    lastWorkspaceSession: [
      { kind: "local", workspacePath: " C:\\work\\demo" },
      {
        kind: "remote",
        workspacePath: "/srv/demo",
        workspaceIdentity: "ssh:demo:/srv/demo",
        target: { kind: "ssh", host: "example.invalid", user: "dev" },
        lastOpenedAt: 1,
        lastConnectionStatus: "connected",
      },
    ],
    recentProjects: ["C:\\work\\demo", "C:\\work\\other"],
  });

  assert.deepEqual(result, [
    {
      kind: "local",
      workspacePath: "C:\\work\\demo",
      label: "demo",
    },
    {
      kind: "remote",
      workspacePath: "/srv/demo",
      workspaceIdentity: "ssh:demo:/srv/demo",
      label: "demo",
      lastConnectionStatus: "connected",
    },
    {
      kind: "local",
      workspacePath: "C:\\work\\other",
      label: "other",
      workspacePurpose: "project",
    },
  ]);
});

test("workspace index does not expose remote target details", () => {
  const [workspace] = buildWorkspaceSummaries({
    lastWorkspaceSession: [
      {
        kind: "remote",
        workspacePath: "/srv/demo",
        workspaceIdentity: "ssh:demo:/srv/demo",
        target: { kind: "ssh", host: "secret.example", user: "dev" },
        lastOpenedAt: 1,
        lastConnectionStatus: "failed",
        lastConnectionError: "private detail",
      },
    ],
    recentProjects: [],
  });

  assert.deepEqual(workspace, {
    kind: "remote",
    workspacePath: "/srv/demo",
    workspaceIdentity: "ssh:demo:/srv/demo",
    label: "demo",
    lastConnectionStatus: "failed",
  });
});
