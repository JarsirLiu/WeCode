import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUiFontFamily, UI_FONT_FAMILY_OPTIONS } from "../src/lib/uiFontFamily.js";

test("UI font family presets accept known values and fall back to system", () => {
  assert.deepEqual(
    UI_FONT_FAMILY_OPTIONS.map((option) => option.value),
    ["system", "pingfang", "yahei", "noto-sans-sc", "segoe"],
  );
  assert.equal(normalizeUiFontFamily("pingfang"), "pingfang");
  assert.equal(normalizeUiFontFamily("uninstalled-font"), "system");
  assert.equal(normalizeUiFontFamily(null), "system");
});
