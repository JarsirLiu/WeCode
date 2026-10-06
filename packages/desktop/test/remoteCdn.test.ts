import assert from "node:assert/strict";
import test from "node:test";
import { resolveRemoteCdnBaseUrls } from "../src/main/remoteCdn.js";

test("keeps a pinned GitHub Release download URL unchanged", () => {
  const previous = process.env.ZCODE_CDN_BASE_URL;
  process.env.ZCODE_CDN_BASE_URL =
    "https://github.com/acme/wecode/releases/download/v3.14.2";
  try {
    assert.deepEqual(resolveRemoteCdnBaseUrls({ version: "3.14.2" }), [
      "https://github.com/acme/wecode/releases/download/v3.14.2",
    ]);
  } finally {
    if (previous === undefined) delete process.env.ZCODE_CDN_BASE_URL;
    else process.env.ZCODE_CDN_BASE_URL = previous;
  }
});

test("keeps the normal CDN release layout", () => {
  const previous = process.env.ZCODE_CDN_BASE_URL;
  process.env.ZCODE_CDN_BASE_URL = "https://cdn.example.test";
  try {
    assert.deepEqual(resolveRemoteCdnBaseUrls({ version: "3.14.2" }), [
      "https://cdn.example.test/zcode/electron/releases/3.14.2",
    ]);
  } finally {
    if (previous === undefined) delete process.env.ZCODE_CDN_BASE_URL;
    else process.env.ZCODE_CDN_BASE_URL = previous;
  }
});
