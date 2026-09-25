import assert from "node:assert/strict";
import test from "node:test";
import { ConfigScope, ConfigKey } from "@zcode/contracts";
import { ConfigPortImpl } from "../src/config/index.js";
import {
  ZCodeConfigFileSchema,
  parseConfigFileToRuntimePatchWithDiagnostics,
} from "../src/config/schema.js";
import { mergeConfigs, createPrioritizedConfig } from "../src/config/config-merger.js";

test("compact prompt version defaults to V2 and supports explicit V1", () => {
  const defaults = new ConfigPortImpl().getAll();
  assert.equal(defaults.compact.promptVersion, "v2");

  const rollback = new ConfigPortImpl({ compact: { promptVersion: "v1" } }).getAll();
  assert.equal(rollback.compact.promptVersion, "v1");
});

test("compact prompt version is validated and merged by scope priority", () => {
  const invalid = ZCodeConfigFileSchema.safeParse({ compact: { promptVersion: "v3" } });
  assert.equal(invalid.success, false);

  const merged = mergeConfigs(
    createPrioritizedConfig({ compact: { promptVersion: "v1" } }, ConfigScope.User),
    createPrioritizedConfig({ compact: { promptVersion: "v2" } }, ConfigScope.Session),
  );
  assert.equal(merged.compact?.promptVersion, "v2");

  const port = new ConfigPortImpl();
  port.merge({ compact: { promptVersion: "v1" } }, ConfigScope.User);
  assert.equal(port.get(ConfigKey.CompactPromptVersion), "v1");
});

test("config file parser accepts only the compact prompt setting", () => {
  const parsed = parseConfigFileToRuntimePatchWithDiagnostics({
    compact: { promptVersion: "v2" },
  });

  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(parsed.config.compact, { promptVersion: "v2" });
});
