import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dirname, "../../../.github/workflows/release-desktop.yml");
const packerPath = resolve(import.meta.dirname, "../../../scripts/pack-remote-assets.mjs");

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

test("remote release assets use the runtime canonical platform keys", async () => {
  const [workflow, packer] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(packerPath, "utf8"),
  ]);
  for (const platform of ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"]) {
    assert.match(workflow, new RegExp(`remote_platforms=.*${platform}`));
    assert.match(packer, new RegExp(`\\"${platform}\\"`));
  }
  assert.match(packer, /manifest-\$\{platformKey\}\.json/);
  assert.match(packer, /remote-\$\{platformKey\}-/);
  assert.doesNotMatch(workflow.match(/remote_platforms=.*$/m)?.[0] ?? "", /linux-x86_64|linux-aarch64/);
  assert.doesNotMatch(packer, /linux-x86_64|linux-aarch64|PLATFORM_MAP/);
  assert.match(workflow, /gh release delete-asset/);
});

test("release description exposes installers above the asset list", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /Download installers/);
  assert.match(workflow, /file="WeCode-\$\{VERSION\}-linux-\$\{arch\}\.\$\{ext\}"/g);
  assert.match(workflow, /file="WeCode-\$\{VERSION\}-mac-\$\{arch\}\.\$\{ext\}"/g);
  assert.match(workflow, /WeCode-\$\{VERSION\}-win-x64\.exe/);
  assert.match(workflow, /for ext in AppImage deb rpm pkg\.tar\.zst/);
  assert.match(workflow, /for ext in dmg zip/);
  assert.match(workflow, /gh release edit .*--notes-file/);
  assert.match(workflow, /--generate-notes/);
});
