import assert from "node:assert/strict";
import test from "node:test";

import { buildReleaseBaseCandidates } from "../src/remote/remoteAssetCdn.js";

test("remote release base candidates do not append version to v-prefixed URL", () => {
  assert.deepEqual(
    buildReleaseBaseCandidates(
      ["https://github.com/JarsirLiu/WeCode/releases/download/v3.14.3"],
      "3.14.3",
    ),
    ["https://github.com/JarsirLiu/WeCode/releases/download/v3.14.3"],
  );
});

test("remote release base candidates append version to an unpinned root", () => {
  assert.deepEqual(buildReleaseBaseCandidates(["https://cdn.example.test/releases"], "3.14.3"), [
    "https://cdn.example.test/releases/3.14.3",
    "https://cdn.example.test/releases",
  ]);
});

test("remote release base candidates preserve mismatched pinned versions", () => {
  assert.deepEqual(
    buildReleaseBaseCandidates(
      ["https://github.com/JarsirLiu/WeCode/releases/download/v3.14.2"],
      "3.14.3",
    ),
    [
      "https://github.com/JarsirLiu/WeCode/releases/download/v3.14.2/3.14.3",
      "https://github.com/JarsirLiu/WeCode/releases/download/v3.14.2",
    ],
  );
});
