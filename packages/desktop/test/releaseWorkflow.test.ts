import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dirname, "../../../.github/workflows/release-desktop.yml");

test("release workflow uses explicit artifact globs", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /dist\/\*\.\{[^}\n]+\}/);
  for (const extension of ["AppImage", "deb", "rpm", "pkg.tar.zst", "dmg", "zip", "exe"]) {
    assert.match(workflow, new RegExp(`packages/desktop/dist/\\*\\.${extension.replaceAll(".", "\\.")}`));
  }

  const installerJobs = workflow.match(/build-installer-[^:]+:\n[\s\S]*?(?=\n  build-|\n#|$)/g) ?? [];
  assert.equal(installerJobs.length, 5);
  for (const job of installerJobs) {
    assert.match(job, /ZCODE_SKIP_REMOTE_ASSETS:\s*["']?1["']?/);
  }

  const remoteAssetsJob = workflow.match(/  build-remote-assets:\n[\s\S]*?(?=\n  publish:|\n#|$)/)?.[0] ?? "";
  assert.doesNotMatch(remoteAssetsJob, /ZCODE_SKIP_REMOTE_ASSETS/);
});
