import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRuntimeProcessEnv } from "../src/runtime-tools/runtimeCommandEnv.js";

// 旧版 JDK 安装器写出的机器级 PATH 片段：条目首尾带引号。
const QUOTED_JDK_PATH =
  'C:\\WINDOWS\\system32;"%JAVA_HOME%\\bin;%JAVA_HOME%\\jre\\bin";D:\\nvmspace\\nodejs';

test("win32 PATH entries drop surrounding quotes", () => {
  const normalized = normalizeRuntimeProcessEnv({ PATH: QUOTED_JDK_PATH }, "win32");

  assert.deepEqual(normalized.PATH?.split(";"), [
    "C:\\WINDOWS\\system32",
    "%JAVA_HOME%\\bin",
    "%JAVA_HOME%\\jre\\bin",
    "D:\\nvmspace\\nodejs",
  ]);
});

test("win32 PATH normalization is a no-op for a quote-free PATH", () => {
  const path = "C:\\WINDOWS\\system32;D:\\nvmspace\\nodejs";

  assert.equal(normalizeRuntimeProcessEnv({ PATH: path }, "win32").PATH, path);
});

test("non-win32 PATH is passed through untouched", () => {
  const path = '/usr/local/bin:/d/Program Files/Java/jdk1.8.0_291/jre/bin"';

  assert.equal(normalizeRuntimeProcessEnv({ PATH: path }, "linux").PATH, path);
});

test("case-insensitive PATH keys collapse to PATH with the last value winning", () => {
  const normalized = normalizeRuntimeProcessEnv({ Path: "C:\\one", PATH: '"D:\\two"' }, "win32");

  assert.deepEqual(
    Object.keys(normalized)
      .filter((key) => key.toUpperCase() === "PATH")
      .sort(),
    ["PATH"],
  );
  assert.equal(normalized.PATH, "D:\\two");
});

test("a quote inside an entry is preserved", () => {
  const normalized = normalizeRuntimeProcessEnv({ PATH: 'C:\\foo"bar' }, "win32");

  assert.equal(normalized.PATH, 'C:\\foo"bar');
});
