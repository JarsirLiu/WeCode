import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ShellInitSnapshotManager } from "../src/exec/shell-init-snapshot.js";

// 真实的 MSYS 转换残缺样本：开头引号丢失、\bin 被截断、结尾引号甩到下一条开头。
const MANGLED_GIT_BASH_PATH =
  '/usr/bin:/d/Program Files/Java/jdk1.8.0_291/bi:/d/Program Files/Java/jdk1.8.0_291/jre/bin":/d/nvmspace/nodejs';

function createFakeExecFile(capturedPath: string) {
  const calls: string[][] = [];

  const execFile = async (
    _file: string,
    args: string[],
    _options: unknown,
  ): Promise<{ stdout: string; stderr: string }> => {
    calls.push(args);
    if (args[0] === "-lc") return { stdout: `${capturedPath}\n`, stderr: "" };
    return { stdout: "", stderr: "" };
  };

  return {
    calls,
    execFile,
    creationScript: () => calls.find((args) => args[0] === "-c")?.[2] ?? "",
    pathExportLine: () =>
      (calls.find((args) => args[0] === "-c")?.[2] ?? "")
        .split("\n")
        .find((line) => line.startsWith("export PATH=")),
  };
}

async function withTempRootDir<T>(body: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(join(tmpdir(), "zcode-shell-snapshot-"));
  try {
    return await body(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("git-bash snapshot persists a quote-free PATH", async () => {
  await withTempRootDir(async (rootDir) => {
    const fake = createFakeExecFile(MANGLED_GIT_BASH_PATH);
    const manager = new ShellInitSnapshotManager({ execFile: fake.execFile });

    await manager.getOrCreate({
      env: { HOME: rootDir, PATH: "C:\\WINDOWS\\system32" },
      rootDir,
      shellDialect: "git-bash",
      shellPath: "C:\\Program Files\\Git\\bin\\bash.exe",
    });

    const pathLine = fake.pathExportLine();
    assert.ok(pathLine, "snapshot must export PATH");
    assert.equal(pathLine.includes('"'), false, "persisted PATH must not contain a quote");
    assert.ok(pathLine.includes("/jdk1.8.0_291/jre/bin"), "stripped entry must remain");
    assert.ok(!pathLine.includes('/jdk1.8.0_291/jre/bin"'), "stray quote must be removed");
  });
});

test("git-bash snapshot leaves the truncated entry untouched", async () => {
  await withTempRootDir(async (rootDir) => {
    const fake = createFakeExecFile(MANGLED_GIT_BASH_PATH);
    const manager = new ShellInitSnapshotManager({ execFile: fake.execFile });

    await manager.getOrCreate({
      env: { HOME: rootDir, PATH: "C:\\WINDOWS\\system32" },
      rootDir,
      shellDialect: "git-bash",
      shellPath: "C:\\Program Files\\Git\\bin\\bash.exe",
    });

    const pathLine = fake.pathExportLine();
    assert.ok(pathLine, "snapshot must export PATH");
    // 截断只能靠和 Windows PATH 做往返比对才能恢复，这里明确不做。
    assert.ok(pathLine.includes("/jdk1.8.0_291/bi"), "truncated entry is preserved as captured");
    assert.ok(!pathLine.includes("/jdk1.8.0_291/bin"), "truncated entry is not repaired");
  });
});

test("git-bash snapshot falls back to the inherited PATH when the capture is empty", async () => {
  await withTempRootDir(async (rootDir) => {
    const fake = createFakeExecFile("");
    const manager = new ShellInitSnapshotManager({ execFile: fake.execFile });

    await manager.getOrCreate({
      env: { HOME: rootDir, PATH: "C:\\WINDOWS\\system32" },
      rootDir,
      shellDialect: "git-bash",
      shellPath: "C:\\Program Files\\Git\\bin\\bash.exe",
    });

    assert.equal(fake.pathExportLine(), "export PATH='C:\\WINDOWS\\system32'");
  });
});

test("posix snapshot does not run the PATH capture", async () => {
  await withTempRootDir(async (rootDir) => {
    const fake = createFakeExecFile("this-would-be-a-poison");
    const manager = new ShellInitSnapshotManager({ execFile: fake.execFile });

    await manager.getOrCreate({
      env: { HOME: rootDir, PATH: "C:\\WINDOWS\\system32" },
      rootDir,
      shellDialect: "posix",
      shellPath: "/usr/bin/bash",
    });

    assert.equal(
      fake.calls.filter((args) => args[0] === "-lc").length,
      0,
      "posix dialect must not probe the shell PATH",
    );
    assert.equal(fake.pathExportLine(), "export PATH='C:\\WINDOWS\\system32'");
  });
});
